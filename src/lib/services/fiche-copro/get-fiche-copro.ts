// Service de la fiche copro : compose le referentiel (App A) + les donnees Estale
// (CS / historique / conformite) + les prochains evenements (calendrier). Passe par
// le routeur, jamais un adapter en direct (ADR-001).

import type { DonneesEstaleCopro, FicheCopro, ItemConformite } from "@/lib/domain/copropriete";
import { prochainsEvenements } from "@/lib/domain/calendrier";
import { statutPourDate } from "@/lib/domain/confirmation-evenement";
import { construireLigne } from "@/lib/domain/parcours-ag";
import { getCoproRepository, getJalonRepository, getGestionnaireRepository } from "@/lib/adapters/router";
import { donneesCoproEstale } from "@/lib/services/estale/donnees-copro-estale";
import { getConfirmations } from "@/lib/services/coproprietes/confirmation-evenement";
import { getEvenements } from "@/lib/services/calendrier/get-calendrier";
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
  // Les 4 appels ci-dessous ne dependent que de copro/gestionnaireId (pas les uns des
  // autres) -> parallelises. La tolerance aux pannes d'Estale (chargerEstale) est
  // inchangee : elle ne rejette jamais, donc ne fait pas echouer le Promise.all.
  const [{ estale, estaleIndisponible }, tous, jalons, compta] = await Promise.all([
    chargerEstale(code),
    getEvenements(gestionnaireId),
    copro.prochaineAg ? getJalonRepository().getJalons(copro.code, copro.prochaineAg.date) : Promise.resolve([]),
    copro.prochaineAg ? getEtatCompta(copro.code, copro.prochaineAg.date) : Promise.resolve(undefined),
  ]);
  const prochains = prochainsEvenements(
    tous.filter((e) => e.coproCode === code),
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

  // Parcours AG de la copro (meme logique que le dashboard) : l'etat "accompli" se
  // deduit des jalons deja charges (Promise.all ci-dessus) -> pas de requete supplementaire.
  const accompli = new Set(jalons.filter((j) => j.statut === "accompli").map((j) => j.code));
  const parcours = construireLigne(copro, accompli, aujourdhuiISO)?.ligne;

  // (Etat compta de la prochaine AG : charge en parallele dans le Promise.all ci-dessus.)

  // Confirmation des prochaines dates AG/CS par le conseil syndical (demande patron :
  // une date posee est provisoire tant que le CS n'a pas valide). Seules les dates A
  // VENIR portent un statut : confirmer une date passee n'a pas de sens.
  const confirmations = await getConfirmations(copro.code);
  const confAg = confirmations.find((c) => c.type === "AG") ?? null;
  const confCs = confirmations.find((c) => c.type === "CS") ?? null;
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

  return {
    copro,
    estale,
    prochains,
    derniereAg: historique[0],
    historique,
    conformite,
    jalons,
    ...(estaleIndisponible ? { estaleIndisponible } : {}),
    ...(parcours ? { parcours } : {}),
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
  };
}
