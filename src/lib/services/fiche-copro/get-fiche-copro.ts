// Service de la fiche copro : compose le referentiel (App A) + les donnees eStale
// (CS / historique / conformite) + les prochains evenements (calendrier). Passe par
// le routeur, jamais un adapter en direct (ADR-001).

import type { DonneesEstaleCopro, FicheCopro } from "@/lib/domain/copropriete";
import { prochainsEvenements } from "@/lib/domain/calendrier";
import { getCoproRepository, getCondoEstaleProvider } from "@/lib/adapters/router";
import { getEvenements } from "@/lib/services/calendrier/get-calendrier";

const DONNEES_ESTALE_VIDES: DonneesEstaleCopro = {
  conseilSyndical: [],
  historiqueAg: [],
  conformite: [],
};

export async function getFicheCopro(
  code: string,
  gestionnaireId: string,
  aujourdhuiISO: string,
): Promise<FicheCopro | null> {
  const copro = await getCoproRepository().findByCode(code);
  if (!copro) return null;

  // Donnees eStale : null si la copro n'est pas encore sur eStale -> bloc vide assume.
  const estale =
    (await getCondoEstaleProvider().getDonneesCopro(code)) ?? DONNEES_ESTALE_VIDES;

  const tous = await getEvenements(gestionnaireId);
  const prochains = prochainsEvenements(
    tous.filter((e) => e.coproCode === code),
    aujourdhuiISO,
    5,
  );

  return { copro, estale, prochains, derniereAg: estale.historiqueAg[0] };
}
