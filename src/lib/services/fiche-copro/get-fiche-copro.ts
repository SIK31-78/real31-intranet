// Service de la fiche copro : compose le referentiel (App A) + les donnees Estale
// (CS / historique / conformite) + les prochains evenements (calendrier). Passe par
// le routeur, jamais un adapter en direct (ADR-001).

import type { DonneesEstaleCopro, FicheCopro, ItemConformite } from "@/lib/domain/copropriete";
import { prochainsEvenements } from "@/lib/domain/calendrier";
import { construireLigne } from "@/lib/domain/parcours-ag";
import { getCoproRepository, getJalonRepository } from "@/lib/adapters/router";
import { donneesCoproEstale } from "@/lib/services/estale/donnees-copro-estale";
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

export async function getFicheCopro(
  code: string,
  gestionnaireId: string,
  aujourdhuiISO: string,
): Promise<FicheCopro | null> {
  // gestionnaireId sert aussi de scope de cloisonnement (managerId).
  const copro = await getCoproRepository().findByCode(code, gestionnaireId);
  if (!copro) return null;

  // Donnees Estale : null si la copro n'est pas encore sur Estale -> bloc vide assume.
  // Si Estale tombe (5xx / timeout), on NE crashe PAS la fiche : on degrade sur le
  // referentiel et on signale l'indisponibilite (robustesse, source secondaire).
  let estale = DONNEES_ESTALE_VIDES;
  let estaleIndisponible = false;
  try {
    estale = (await donneesCoproEstale(code)) ?? DONNEES_ESTALE_VIDES;
  } catch (err) {
    estaleIndisponible = true;
    console.warn(`[fiche-copro] Estale indisponible pour ${code} :`, (err as Error).message);
  }

  const tous = await getEvenements(gestionnaireId);
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

  // Jalons de la prochaine AG (cibles calculees + etat persiste), si AG a venir.
  const jalons = copro.prochaineAg
    ? await getJalonRepository().getJalons(copro.code, copro.prochaineAg.date)
    : [];

  // Parcours AG de la copro (meme logique que le dashboard) : l'etat "accompli" se
  // deduit des jalons deja charges -> pas de requete supplementaire.
  const accompli = new Set(jalons.filter((j) => j.statut === "accompli").map((j) => j.code));
  const parcours = construireLigne(copro, accompli, aujourdhuiISO)?.ligne;

  // Etat compta de la prochaine AG (flags + notes), si une AG est datee.
  const compta = copro.prochaineAg ? await getEtatCompta(copro.code, copro.prochaineAg.date) : undefined;

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
  };
}
