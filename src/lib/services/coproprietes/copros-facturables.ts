// Copros sur lesquelles un utilisateur peut FACTURER (Sekou 2026-07-29).
//
// Deux perimetres, pas un :
//   - GESTIONNAIRE : son portefeuille (list(managerId)), comme avant.
//   - COMPTABLE    : il n'a AUCUN portefeuille (aucune copro ne porte son id comme
//                    managerId) -> l'ecran de facturation lui renvoyait une liste VIDE,
//                    alors que facturer est precisement son metier. Son perimetre est
//                    l'AGENCE : Isabelle tient Maisons-Laffitte, Romain et Elsa tiennent
//                    HLS / LGC / ASN (cf. domain/perimetre-comptable.ts).
//
// On ne lui ouvre PAS tout le cabinet : un comptable sans perimetre declare voit une liste
// vide, jamais la liste complete. Un ecran vide se voit et se signale ; une liste trop
// large fait facturer des copros qui ne sont pas les siennes.
//
// Passe par le routeur (ADR-001).

import { getAgenceRepository } from "@/lib/adapters/router";
import { getCoproprietes } from "@/lib/services/coproprietes/get-coproprietes";
import {
  aUnPerimetreComptable,
  filtrerSurPerimetreComptable,
} from "@/lib/domain/perimetre-comptable";
import type { Copropriete } from "@/lib/domain/copropriete";

/**
 * Copros facturables par cet utilisateur. `estComptable` est resolu par l'appelant (couche
 * app : le domaine des roles vit dans lib/auth, que les services ne peuvent pas importer).
 */
export async function getCoprosFacturables(params: {
  managerId: string;
  email?: string | null;
  estComptable: boolean;
}): Promise<Copropriete[]> {
  const { managerId, email, estComptable } = params;
  // Comptable SANS perimetre declare : on retombe sur son portefeuille (vide en pratique)
  // plutot que d'ouvrir le cabinet. Comportement identique a avant pour lui.
  if (!estComptable || !aUnPerimetreComptable(email)) return getCoproprietes(managerId);

  // Perimetre agence : on lit TOUTES les copros puis on filtre sur les agences du comptable.
  // La copro porte un `agenceId` technique -> resolution id -> code via la table Agency
  // (4 lignes). Table absente / agence non resolue -> la copro est EXCLUE (jamais incluse
  // par defaut).
  const [toutes, agences] = await Promise.all([
    getCoproprietes(),
    getAgenceRepository().listerAgences(),
  ]);
  const codeParId = new Map(agences.map((a) => [a.id, a.code]));
  return filtrerSurPerimetreComptable(toutes, email, (c) =>
    c.agenceId ? codeParId.get(c.agenceId) : undefined,
  );
}
