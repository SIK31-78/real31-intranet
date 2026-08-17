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
// La resolution elle-meme vit dans copros-du-perimetre.ts : la file des recaps d'AG recus
// a besoin EXACTEMENT du meme cadrage, et deux copies de cette regle finiraient par
// diverger. Ce module reste le point d'entree nomme par l'INTENTION (facturer).

import type { Copropriete } from "@/lib/domain/copropriete";
import {
  getCoprosDuPerimetre,
  type PerimetreUtilisateur,
} from "@/lib/services/coproprietes/copros-du-perimetre";

/**
 * Copros facturables par cet utilisateur. `estComptable` est resolu par l'appelant (couche
 * app : le domaine des roles vit dans lib/auth, que les services ne peuvent pas importer).
 */
export async function getCoprosFacturables(
  params: PerimetreUtilisateur,
): Promise<Copropriete[]> {
  return getCoprosDuPerimetre(params);
}
