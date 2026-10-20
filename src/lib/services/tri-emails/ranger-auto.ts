// Rangement AUTOMATIQUE des mails a piste « sure » de syndic4 (decision Sekou du 20/10/2026,
// ADR-046 : « un clic d'abord, puis de l'automatique signal par signal »). Appele par la tache
// planifiee (/api/cron/tri-emails, toutes les 5 min), APRES la reconciliation.
//
// Meme geste qu'un clic : rangerMail (dossier du binome, etiquette, journal), avec
// par = « automatique ». Annulable d'un clic comme un rangement manuel ; un mail annule une
// fois n'est plus jamais range tout seul (rangeableAutomatiquement : « deja-passe »).
//
// Interrupteurs : MAIL_TRI_AUTO=on (coupe par defaut) ; MAIL_TRI_ECRITURE coupe = rangements
// simules et journalises comme tels, comme un clic.

import {
  BOITE_TRI_AUTOMATIQUE,
  PAR_AUTOMATIQUE,
  rangeableAutomatiquement,
  type RefusAutomatique,
} from "@/lib/domain/tri-emails";
import { debutTri, triAutomatiqueActif } from "@/lib/domain/mail-gate";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import { getIngestionTri } from "@/lib/adapters/router";
import { mailDeLaFile } from "./lire-file";
import { depsParDefaut, rangerMail, type DepsRangement } from "./ranger";

/** Mails lus a chaque passage : la meme fenetre que l'ecran. */
const MAX_LUS = 100;
/** Au plus tant de rangements par passage : quelques appels Graph chacun, un par un. */
const MAX_RANGES = 30;
/** Budget de temps des rangements, dans les 60 s du cron (la reconciliation passe avant). */
const BUDGET_MS = 25_000;

export interface OptionsAutomatique {
  /** Defaut : MAIL_TRI_AUTO=on. */
  actif?: boolean;
  max?: number;
  budgetMs?: number;
  maintenant?: () => number;
  /** Defaut : la boite de reception, depuis la mise en service du tri (MAIL_TRI_DEPUIS). */
  lireMails?: (boite: string) => Promise<RawMail[]>;
}

export interface BilanAutomatique {
  actif: boolean;
  /** Mails de la boite de reception examines (deja passes par le tri compris). */
  examines: number;
  ranges: number;
  /** Rangeables, mais le rangement a echoue (retente au passage suivant). */
  echecs: number;
  /** Rangeables, laisses pour le passage suivant (plafond ou budget de temps atteint). */
  reportes: number;
  refus: Partial<Record<RefusAutomatique, number>>;
}

const lireParDefaut = (boite: string): Promise<RawMail[]> => {
  const depuis = debutTri();
  return getIngestionTri().lireRecents({ email: boite, max: MAX_LUS, ...(depuis ? { depuis } : {}) });
};

export async function rangerAutomatiquement(
  deps: DepsRangement = depsParDefaut(),
  opts: OptionsAutomatique = {},
): Promise<BilanAutomatique> {
  const bilan: BilanAutomatique = { actif: opts.actif ?? triAutomatiqueActif(), examines: 0, ranges: 0, echecs: 0, reportes: 0, refus: {} };
  const boite = deps.boite;
  // syndic4 seulement : rangeableAutomatiquement le refuserait mail par mail, inutile de lire.
  if (!bilan.actif || !boite || boite !== BOITE_TRI_AUTOMATIQUE) return bilan;

  const maintenant = opts.maintenant ?? Date.now;
  const debut = maintenant();
  const lus = await (opts.lireMails ?? lireParDefaut)(boite);
  if (lus.length === 0) return bilan;

  // Un seul chargement du referentiel et des initiales pour tout le passage (rangerMail les
  // relit a chaque mail sinon).
  const referentiel = deps.referentiel.charger();
  const initiales = deps.initialesParEmail();
  const [ref, initialesParEmail, binomes, dejaPasses] = await Promise.all([
    referentiel,
    initiales,
    deps.repo.binomes(),
    deps.repo.dejaJournalises(boite, lus.map((m) => m.internetMessageId)),
  ]);
  const depsPassage: DepsRangement = { ...deps, referentiel: { charger: () => referentiel }, initialesParEmail: () => initiales };

  // Les plus anciens d'abord : un report ne retarde que les derniers arrives.
  const aRanger: { m: RawMail; reference: string }[] = [];
  for (const m of [...lus].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
    bilan.examines++;
    // Pas d'historique de conversation ici : il ne rend jamais une piste sure.
    const mail = mailDeLaFile(m, boite, ref, null);
    const dejaPasse = dejaPasses.has(m.internetMessageId);
    const decision = rangeableAutomatiquement(mail, { boite, dejaPasse, copros: ref.copros, initialesParEmail, binomes });
    if (decision.ok) aRanger.push({ m, reference: decision.reference });
    else bilan.refus[decision.motif] = (bilan.refus[decision.motif] ?? 0) + 1;
  }

  const max = opts.max ?? MAX_RANGES;
  const budget = opts.budgetMs ?? BUDGET_MS;
  // Un par un : deux mails vers un dossier pas encore cree le creeraient deux fois.
  for (const { m, reference } of aRanger) {
    if (bilan.ranges + bilan.echecs >= max || maintenant() - debut > budget) {
      bilan.reportes++;
      continue;
    }
    try {
      await rangerMail(
        {
          messageId: m.id,
          internetMessageId: m.internetMessageId,
          expediteur: m.from,
          objet: m.subject || "(sans objet)",
          cible: { type: "copro", reference },
          suggestion: { nature: "sure", candidats: [reference] },
        },
        PAR_AUTOMATIQUE,
        depsPassage,
      );
      bilan.ranges++;
    } catch (e) {
      // Range entre-temps a la main, copro sortie d'ESTALE... : le mail reste dans la file.
      bilan.echecs++;
      console.error(`[tri-emails:auto] ${m.internetMessageId} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return bilan;
}
