// Service de la fiche copro : compose le referentiel (App A) + les donnees Estale
// (CS / historique / conformite) + les prochains evenements (calendrier). Passe par
// le routeur, jamais un adapter en direct (ADR-001).

import type { DonneesEstaleCopro, FicheCopro, ItemConformite } from "@/lib/domain/copropriete";
import { prochainsEvenements } from "@/lib/domain/calendrier";
import { statutPourDate } from "@/lib/domain/confirmation-evenement";
import { calculerCycleAg } from "@/lib/domain/cycle-ag";
import type { StatutAg } from "@/lib/domain/supervision-ag";
import { getSupervisionAg } from "@/lib/services/supervision-ag/get-supervision-ag";
import { getCoproRepository, getJalonRepository, getGestionnaireRepository } from "@/lib/adapters/router";
import { codeAgence } from "@/lib/services/agences/resoudre-agence";
import { donneesCoproEstale } from "@/lib/services/estale/donnees-copro-estale";
import { getConfirmations } from "@/lib/services/coproprietes/confirmation-evenement";
import { evenementsDeCopro } from "@/lib/services/calendrier/get-calendrier";
import { getEtatCompta } from "@/lib/services/compta/get-compta";

const DONNEES_ESTALE_VIDES: DonneesEstaleCopro = {
  conseilSyndical: [],
  historiqueAg: [],
  conformite: [],
};

/** "JJ/MM/AAAA" depuis une date ISO "YYYY-MM-DD" ; "" si absent. */
function jjmmaaaa(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Charge les donnees Estale, degrade sur DONNEES_ESTALE_VIDES si Estale tombe (meme
 *  comportement que l'ancien try/catch inline, extrait pour paralleliser avec le reste). */
async function chargerEstale(
  code: string,
): Promise<{ estale: DonneesEstaleCopro; estaleIndisponible: boolean }> {
  try {
    const donnees = await donneesCoproEstale(code);
    return { estale: donnees ?? DONNEES_ESTALE_VIDES, estaleIndisponible: false };
  } catch (err) {
    console.warn(`[fiche-copro] Estale indisponible pour ${code} :`, (err as Error).message);
    return { estale: DONNEES_ESTALE_VIDES, estaleIndisponible: true };
  }
}

/** Statut de la supervision : utile SEULEMENT pour une AG DATEE deja passee (tenue non
 *  conclue) -> priorisation post-tenue (S2.D). undefined hors de ce cas etroit (comportement
 *  inchange). Isole pour etre parallelise avec le reste (evite un await serie).
 *  `scope` : managerId de cloisonnement (undefined en lecture transverse). */
async function chargerStatutSupervision(
  copro: { code: string; prochaineAg?: { date: string } },
  aujourdhuiISO: string,
  scope: string | undefined,
): Promise<StatutAg | undefined> {
  if (!(copro.prochaineAg?.date && copro.prochaineAg.date < aujourdhuiISO)) return undefined;
  const sup = await getSupervisionAg(`${copro.code}__${copro.prochaineAg.date}`, scope);
  return sup?.statut;
}

export async function getFicheCopro(
  code: string,
  gestionnaireId: string,
  aujourdhuiISO: string,
  options?: { transverse?: boolean },
): Promise<FicheCopro | null> {
  // gestionnaireId sert aussi de scope de cloisonnement (managerId). En LECTURE TRANSVERSE
  // (pole comptable / super-admin, cf. peutVoirComptabilite), on lit la copro SANS scope :
  // le comptable ouvre n'importe quelle fiche. Le cloisonnement des ECRITURES (dates,
  // jalons, supervision, ODJ...) reste porte par chaque action, pas par la lecture.
  const copro = options?.transverse
    ? await getCoproRepository().findByCode(code)
    : await getCoproRepository().findByCode(code, gestionnaireId);
  if (!copro) return null;

  // Donnees Estale : null si la copro n'est pas encore sur Estale -> bloc vide assume.
  // Si Estale tombe (5xx / timeout), on NE crashe PAS la fiche : on degrade sur le
  // referentiel et on signale l'indisponibilite (robustesse, source secondaire).
  //
  // TOUT ce qui ne depend que de copro/gestionnaireId est charge EN UN SEUL lot parallele
  // (avant : cascade serielle statut -> confirmations -> annuaire -> agence). chargerEstale
  // et chargerStatutSupervision ne rejettent pas de facon a casser la fiche : chargerEstale
  // degrade, chargerStatutSupervision ne s'execute que sur un cas etroit.
  const scopeSupervision = options?.transverse ? undefined : gestionnaireId;
  const [{ estale, estaleIndisponible }, jalons, compta, confirmations, statutSupervision, agenceCode] =
    await Promise.all([
      chargerEstale(code),
      copro.prochaineAg ? getJalonRepository().getJalons(copro.code, copro.prochaineAg.date) : Promise.resolve([]),
      copro.prochaineAg ? getEtatCompta(copro.code, copro.prochaineAg.date) : Promise.resolve(undefined),
      getConfirmations(copro.code),
      chargerStatutSupervision(copro, aujourdhuiISO, scopeSupervision),
      // Code d'agence (ML/LGC/HLS/ASN) resolu depuis l'id technique ; undefined si pas
      // d'agence / table indisponible -> l'editeur ne filtre pas (montre toutes les salles).
      codeAgence(copro.agenceId),
    ]);

  // Confirmations AG/CS par le conseil syndical : lues UNE fois (avant : getEvenements les
  // relisait pour TOUT le portefeuille juste pour en garder une copro). Servent aux chips de
  // dates ET a la derivation LOCALE des prochains evenements (O1 : pure, plus de fetch large).
  const confAg = confirmations.find((c) => c.type === "AG") ?? null;
  const confCs = confirmations.find((c) => c.type === "CS") ?? null;
  const prochains = prochainsEvenements(
    evenementsDeCopro(copro, confAg, confCs, aujourdhuiISO),
    aujourdhuiISO,
    5,
  );

  // Historique : detaille si Estale dispo, sinon la derniere AG du referentiel
  // (lastAGDate) -> on affiche au moins ce qu'on a en base.
  const historique =
    estale.historiqueAg.length > 0
      ? estale.historiqueAg
      : copro.derniereAgDate
        ? [{ date: copro.derniereAgDate, type: "AG" as const }]
        : [];

  // Conformite : items du referentiel App A (PPT, assurance, mandat de syndic -
  // exploitables SANS Estale) + items Estale.
  const conformiteReferentiel: ItemConformite[] = [];
  if (copro.pptVote !== undefined) {
    conformiteReferentiel.push({
      libelle: copro.pptVote ? "PPT voté" : "PPT à programmer",
      etat: copro.pptVote ? "ok" : "attention",
    });
  }
  if (copro.assuranceEcheance) {
    conformiteReferentiel.push({
      libelle: `Assurance jusqu'au ${jjmmaaaa(copro.assuranceEcheance)}`,
      etat: copro.assuranceEcheance < aujourdhuiISO ? "ko" : "ok",
    });
  }
  if (copro.mandatSyndicFin) {
    conformiteReferentiel.push({
      libelle: `Mandat de syndic jusqu'au ${jjmmaaaa(copro.mandatSyndicFin)}`,
      etat: copro.mandatSyndicFin < aujourdhuiISO ? "ko" : "attention",
    });
  }
  const conformite = [...conformiteReferentiel, ...estale.conformite];

  // Cycle AG de la copro (LA source unique domain/cycle-ag) : l'etat "accompli" se deduit
  // des jalons deja charges (Promise.all ci-dessus) -> pas de requete supplementaire.
  const accompli = new Set(jalons.filter((j) => j.statut === "accompli").map((j) => j.code));
  // statutSupervision : deja charge (en parallele) ci-dessus via chargerStatutSupervision.
  const cycle = calculerCycleAg(copro, accompli, aujourdhuiISO, statutSupervision);
  // On n'affiche le stepper que s'il y a une action a mener OU un suivi post-tenue en
  // cours (etat "tenue" : "Conclure l'AG" ou "cycle termine"). Cycle complet hors tenue
  // = rien a montrer (meme visibilite qu'avant : parcours null -> stepper masque).
  const afficherCycle = cycle.actionDuMoment !== null || cycle.etat === "tenue";

  // (Etat compta de la prochaine AG : charge en parallele dans le Promise.all ci-dessus.)

  // Confirmation des prochaines dates AG/CS par le conseil syndical (demande patron :
  // une date posee est provisoire tant que le CS n'a pas valide). Seules les dates A
  // VENIR portent un statut : confirmer une date passee n'a pas de sens. (confAg / confCs
  // deja derives des confirmations chargees dans le Promise.all ci-dessus.)
  const confirmationAg =
    copro.prochaineAg && copro.prochaineAg.date >= aujourdhuiISO
      ? statutPourDate(confAg, copro.prochaineAg.date)
      : undefined;
  const confirmationCs =
    copro.prochaineCsDate && copro.prochaineCsDate >= aujourdhuiISO
      ? statutPourDate(confCs, copro.prochaineCsDate)
      : undefined;
  // Ressources reservees (salle / ZOE) portees par la confirmation, remontees pour
  // l'affichage a cote de la date et la pre-selection dans l'editeur.
  const salleAgEmail = confAg?.salleEmail;
  const vehiculeAgEmail = confAg?.vehiculeEmail;
  const salleCsEmail = confCs?.salleEmail;
  const vehiculeCsEmail = confCs?.vehiculeEmail;
  // Mode de tenue (visio / presentiel / hybride) porte par la confirmation : badge a
  // cote de la date + pre-selection dans l'editeur.
  const modeAgReunion = confAg?.modeReunion;
  const modeCsReunion = confCs?.modeReunion;
  // Collaborateurs associes portes par la confirmation : resolus en {email, nom} pour le
  // badge (hors edition) et la pre-selection de l'editeur. On ne charge l'annuaire des
  // gestionnaires QUE s'il y a au moins un collaborateur (evite une requete inutile).
  const emailsCollab = [
    ...(confAg?.collaborateursEmails ?? []),
    ...(confCs?.collaborateursEmails ?? []),
  ];
  const nomParEmail = new Map<string, string>();
  if (emailsCollab.length > 0) {
    const gestionnaires = await getGestionnaireRepository().list();
    for (const g of gestionnaires) {
      if (g.email) nomParEmail.set(g.email.toLowerCase(), g.nomComplet);
    }
  }
  const resoudreCollab = (emails: string[] | undefined): { email: string; nom: string }[] =>
    (emails ?? []).map((email) => ({ email, nom: nomParEmail.get(email.toLowerCase()) ?? email }));
  const collaborateursAg = resoudreCollab(confAg?.collaborateursEmails);
  const collaborateursCs = resoudreCollab(confCs?.collaborateursEmails);
  // (agenceCode : deja resolu en parallele dans le Promise.all ci-dessus.)

  return {
    copro,
    estale,
    prochains,
    derniereAg: historique[0],
    historique,
    conformite,
    jalons,
    ...(estaleIndisponible ? { estaleIndisponible } : {}),
    ...(afficherCycle ? { cycle } : {}),
    ...(compta ? { compta } : {}),
    ...(confirmationAg ? { confirmationAg } : {}),
    ...(confirmationCs ? { confirmationCs } : {}),
    ...(salleAgEmail ? { salleAgEmail } : {}),
    ...(vehiculeAgEmail ? { vehiculeAgEmail } : {}),
    ...(salleCsEmail ? { salleCsEmail } : {}),
    ...(vehiculeCsEmail ? { vehiculeCsEmail } : {}),
    ...(modeAgReunion ? { modeAgReunion } : {}),
    ...(modeCsReunion ? { modeCsReunion } : {}),
    ...(collaborateursAg.length > 0 ? { collaborateursAg } : {}),
    ...(collaborateursCs.length > 0 ? { collaborateursCs } : {}),
    ...(agenceCode ? { agenceCode } : {}),
  };
}
