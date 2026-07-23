// Service : liste des copros du gestionnaire enrichie de leur ETAT de cycle AG
// (cockpit). Passe par le routeur (ADR-001). "Convoquee" = jalon CONVOC accompli.

import { getCoproRepository, getJalonRepository } from "@/lib/adapters/router";
import { etatCycleAg, ETAT_CYCLE_ORDRE, type EtatCycle } from "@/lib/domain/etat-cycle-ag";
import { getPrisesEnMain } from "@/lib/services/coproprietes/prise-en-main";
import type { SourceCopro } from "@/lib/domain/copropriete";
import type { PipelineEtat } from "@/lib/domain/dashboard";

export interface CoproPilotage {
  code: string;
  nom: string;
  ville: string;
  source: SourceCopro;
  etat: EtatCycle;
  enRetard: boolean;
  /** Prise en main (onboarding) : dates validees par le gestionnaire. */
  prise: boolean;
  /** Prochaine AG (ISO) si fixee, pour l'echeance affichee. */
  agDate?: string;
  /** Derniere AG tenue (ISO) - aide a la verification a la prise en main. */
  derniereAgDate?: string;
  /** Cloture de l'exercice "JJ/MM" (filtre exercice). */
  exerciceCloture?: string;
}

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// managerId absent = vue TRANSVERSE (toutes les copros) - reserve a l'encadrement/compta/
// super-admin par l'appelant (cf. peutVoirToutesLesCopros). Un gestionnaire passe son id.
export async function getCoprosPilotage(managerId?: string): Promise<CoproPilotage[]> {
  const copros = await getCoproRepository().list(managerId);
  const today = aujourdhuiISO();

  const codes = copros.map((c) => c.code);

  // Deux lectures independantes -> en parallele : etats de jalons (CONVOC) et prise en main.
  const [etats, prises] = await Promise.all([
    getJalonRepository().getEtats(codes),
    getPrisesEnMain(codes), // null = feature inerte -> tout considere pris en main
  ]);

  // CONVOC marquee accomplie par copro+AG (etat "convoquee").
  const convocOk = new Set<string>();
  for (const e of etats) {
    if (e.type === "CONVOC" && e.statut === "accompli") convocOk.add(`${e.coproCode}|${e.agDate}`);
  }

  return copros.map((c) => {
    const ag = c.prochaineAg?.date;
    const convoc = ag ? convocOk.has(`${c.code}|${ag}`) : false;
    const { etat, enRetard } = etatCycleAg(c, convoc, today);
    return {
      code: c.code,
      nom: c.nom,
      ville: c.adresse.ville,
      source: c.source,
      etat,
      enRetard,
      prise: prises === null ? true : prises.has(c.code),
      ...(ag ? { agDate: ag } : {}),
      ...(c.derniereAgDate ? { derniereAgDate: c.derniereAgDate } : {}),
      ...(/^\d{2}\/\d{2}$/.test(c.exercice.fin) ? { exerciceCloture: c.exercice.fin } : {}),
    };
  });
}

/**
 * Pipeline des AG (compteurs par etat du cycle) DERIVE de la liste deja chargee - aucun
 * second fetch. Depuis le demantelement du dashboard (Sekou 2026-07-22), ce resume vit en
 * tete de "Toutes les coproprietes" : chaque compteur renvoie vers la liste filtree (?etat=).
 * Ne compte QUE les copros prises en main (les "a prendre en main" sont hors cockpit, dans
 * leur propre bac) - meme semantique que l'ancien pipeline du dashboard.
 */
export function pipelineDepuisCopros(copros: CoproPilotage[]): PipelineEtat[] {
  const pipeline: PipelineEtat[] = ETAT_CYCLE_ORDRE.map((etat) => ({ etat, count: 0, enRetard: 0 }));
  const parEtat = new Map(pipeline.map((p) => [p.etat, p]));
  for (const c of copros) {
    if (!c.prise) continue;
    const p = parEtat.get(c.etat)!;
    p.count++;
    if (c.enRetard) p.enRetard++;
  }
  return pipeline;
}
