// Adapter COMPOSITE du referentiel copro : compose le miroir Supabase (261 Crypto + copros
// eStale mirrorees, INCHANGE) et le provider eStale live (les copros REAL31 lues en direct).
// C'est le socle de CHAQUE page (toutes appellent list()) -> la robustesse prime (REGLE N°1).
//
// Ne depend que de PORTS injectes par le routeur (la regle boundaries interdit a un adapter
// d'en importer un autre) et de la logique PURE de fusion (domain/copro-fusion).
//
// DEGRADATION PROPRE (non negociable) : si eStale est injoignable/lent/en erreur, on retombe
// sur le MIROIR SEUL (l'app tourne, il manque juste les 3 copros eStale orphelines) - jamais
// de plantage ni de page blanche. Chaque appel eStale est sous try/catch + console.warn.

import type { CoproRepository } from "@/lib/ports/copro-repository";
import type { CoproEstaleProvider } from "@/lib/ports/copro-estale-provider";
import type { CoproDatesRepository } from "@/lib/ports/copro-dates-repository";
import type { Copropriete } from "@/lib/domain/copropriete";
import {
  appliquerDates,
  datesDuMiroir,
  fusionnerCopros,
  fusionnerDates,
  normaliserRef,
} from "@/lib/domain/copro-fusion";

export class CompositeCoproRepository implements CoproRepository {
  constructor(
    private readonly miroir: CoproRepository,
    private readonly estale: CoproEstaleProvider,
    private readonly datesRepo: CoproDatesRepository,
  ) {}

  async list(managerId?: string): Promise<Copropriete[]> {
    const miroirScoped = await this.miroir.list(managerId);
    let estaleBrutes: Copropriete[];
    try {
      estaleBrutes = await this.estale.listerCoprosEstale();
    } catch (err) {
      // eStale KO -> miroir SEUL (garde les copros eStale mirrorees, perd les orphelines).
      console.warn("[composite-copro] eStale indisponible (list), miroir seul :", (err as Error).message);
      return miroirScoped;
    }
    // Repli des dates AG/CS : depuis le miroir NON cloisonne (une copro eStale peut avoir sa
    // ligne miroir hors du scope courant ; on ne veut pas perdre sa date pour autant).
    const miroirUnscoped = managerId ? await this.listUnscopedSafe(miroirScoped) : miroirScoped;
    const estaleAvecDates = await this.appliquerDatesEstale(estaleBrutes, miroirUnscoped);
    return fusionnerCopros({ crypto: miroirScoped, estale: estaleAvecDates, managerId });
  }

  async listerToutes(): Promise<Copropriete[]> {
    const miroirTous = await this.miroir.listerToutes();
    let estaleBrutes: Copropriete[];
    try {
      estaleBrutes = await this.estale.listerCoprosEstale();
    } catch (err) {
      console.warn("[composite-copro] eStale indisponible (listerToutes), miroir seul :", (err as Error).message);
      return miroirTous;
    }
    const estaleAvecDates = await this.appliquerDatesEstale(estaleBrutes, miroirTous);
    return fusionnerCopros({ crypto: miroirTous, estale: estaleAvecDates });
  }

  async findByCode(code: string, managerId?: string): Promise<Copropriete | null> {
    const refs = await this.refsEstaleSafe();
    // eStale KO (refs null) OU code non eStale -> miroir (les mirrorees y sont, les orphelines non).
    if (!refs || !refs.has(normaliserRef(code))) {
      return this.miroir.findByCode(code, managerId);
    }
    try {
      const brute = await this.estale.getCoproEstale(code);
      if (!brute) return this.miroir.findByCode(code, managerId);
      // Cloisonnement en code : hors scope -> null (comme le miroir renvoie null hors perimetre).
      if (managerId && brute.managerId !== managerId && brute.assistantId !== managerId) return null;
      const [intranet, miroir] = await Promise.all([
        this.datesRepo.lire(code).catch(() => null),
        this.miroir.findByCode(code).catch(() => null), // non cloisonne : repli dates uniquement
      ]);
      return appliquerDates(brute, fusionnerDates(intranet, datesDuMiroir(miroir)));
    } catch (err) {
      console.warn(`[composite-copro] eStale indisponible (findByCode ${code}), miroir :`, (err as Error).message);
      return this.miroir.findByCode(code, managerId);
    }
  }

  async setDateEvenement(
    coproCode: string,
    type: "ag" | "cs",
    quand: "prochaine" | "derniere",
    dateISO: string | null,
    managerId: string,
  ): Promise<void> {
    let estaleCopro: Copropriete | null = null;
    try {
      const refs = await this.estale.listerCoprosEstale();
      if (refs.some((c) => normaliserRef(c.code) === normaliserRef(coproCode))) {
        estaleCopro = await this.estale.getCoproEstale(coproCode);
      }
    } catch (err) {
      // eStale KO : on ne sait pas si c'est une copro eStale -> on tente le miroir (repli sur
      // la ligne mirroree pour les 4 deja mirrorees ; no-op sinon). Jamais de plantage.
      console.warn(`[composite-copro] eStale indisponible (setDate ${coproCode}), miroir :`, (err as Error).message);
    }
    if (estaleCopro) {
      // Cloisonnement identique au miroir : no-op silencieux si le manager ne gere/assiste pas.
      if (managerId && estaleCopro.managerId !== managerId && estaleCopro.assistantId !== managerId) return;
      await this.datesRepo.ecrire(coproCode, type, quand, dateISO);
      return;
    }
    // Copro Crypto (ou eStale indeterminee car API KO) -> miroir INCHANGE.
    return this.miroir.setDateEvenement(coproCode, type, quand, dateISO, managerId);
  }

  // --- Interne -----------------------------------------------------------------

  /** Complete les copros eStale (sans date) : dates intranet PRIORITAIRES, repli miroir. */
  private async appliquerDatesEstale(
    estaleBrutes: Copropriete[],
    miroirList: Copropriete[],
  ): Promise<Copropriete[]> {
    const miroirParRef = new Map(miroirList.map((c) => [normaliserRef(c.code), c]));
    let datesIntranet: Map<string, ReturnType<typeof datesDuMiroir>>;
    try {
      datesIntranet = await this.datesRepo.lireToutes();
    } catch (err) {
      // La table de dates ne doit jamais blanchir une page : repli miroir seul.
      console.warn("[composite-copro] lecture intranet_copro_dates KO, repli miroir :", (err as Error).message);
      datesIntranet = new Map();
    }
    return estaleBrutes.map((c) =>
      appliquerDates(
        c,
        fusionnerDates(datesIntranet.get(c.code) ?? null, datesDuMiroir(miroirParRef.get(normaliserRef(c.code)))),
      ),
    );
  }

  /** Ensemble des references eStale normalisees, ou null si eStale est injoignable. */
  private async refsEstaleSafe(): Promise<Set<string> | null> {
    try {
      const copros = await this.estale.listerCoprosEstale();
      return new Set(copros.map((c) => normaliserRef(c.code)));
    } catch (err) {
      console.warn("[composite-copro] eStale indisponible (refs), miroir :", (err as Error).message);
      return null;
    }
  }

  /** Miroir NON cloisonne pour le repli des dates ; degrade sur la liste deja en main. */
  private async listUnscopedSafe(secours: Copropriete[]): Promise<Copropriete[]> {
    try {
      return await this.miroir.list();
    } catch {
      return secours;
    }
  }
}
