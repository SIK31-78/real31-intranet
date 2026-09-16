// Resolution agencyId (id technique copro / user) -> code lisible (ML / LGC / HLS / ASN).
// Passe par le routeur (ADR-001), jamais un adapter en direct. La table Agency fait 4
// lignes : on la lit UNE fois par requete grace a React `cache` (memoisation par requete
// serveur), pas un aller-retour par copro.

import { cache } from "react";
import { getAgenceRepository, getCoproRepository } from "@/lib/adapters/router";

/** Table { id -> code } des agences, memoisee par requete. [] si la table est absente
 *  (adapter degrade) -> la Map est vide -> aucune resolution -> pas de filtre agence. */
const chargerAgencesParId = cache(async (): Promise<Map<string, string>> => {
  const agences = await getAgenceRepository().listerAgences();
  return new Map(agences.map((a) => [a.id, a.code]));
});

/**
 * Code d'agence (ML/LGC/HLS/ASN) d'un id technique, ou undefined si l'id est absent /
 * inconnu / la table indisponible. undefined = "agence inconnue" cote UI -> pas de filtre
 * (on montre tout), jamais un ecran vide.
 */
export async function codeAgence(
  agencyId: string | null | undefined,
): Promise<string | undefined> {
  if (!agencyId) return undefined;
  const parId = await chargerAgencesParId();
  return parId.get(agencyId);
}

/**
 * Code d'agence d'une copropriete (ML/LGC/HLS/ASN), ou undefined si la copro est inconnue
 * ou sans agence. Sert aux gardes « direction DE CETTE AGENCE » (referent syndic).
 */
export async function agenceDeCopro(coproCode: string): Promise<string | undefined> {
  const copro = await getCoproRepository().findByCode(coproCode).catch(() => null);
  return codeAgence(copro?.agenceId);
}
