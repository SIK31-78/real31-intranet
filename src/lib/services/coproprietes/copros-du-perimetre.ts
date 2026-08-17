// Perimetre de copros d'un utilisateur : LE cadrage commun des ecrans transverses
// (facturation, file des recaps d'AG recus...). Extrait de copros-facturables.ts, qui
// portait deja exactement cette regle - on evite d'en avoir deux versions qui divergent.
//
// Deux cadrages, pas un :
//   - GESTIONNAIRE : son PORTEFEUILLE (list(managerId)), comme partout ailleurs.
//   - COMPTABLE    : il n'a AUCUN portefeuille (aucune copro ne porte son id comme
//                    managerId) -> tout ecran scope par managerId lui renvoyait une liste
//                    VIDE. Son perimetre est l'AGENCE : Isabelle tient Maisons-Laffitte,
//                    Romain et Elsa tiennent HLS / LGC / ASN (domain/perimetre-comptable).
//
// REGLE NON NEGOCIABLE : on n'ouvre JAMAIS tout le cabinet par defaut. Un comptable sans
// perimetre declare retombe sur son portefeuille (vide en pratique) ; une agence qui ne se
// resout pas EXCLUT la copro. Un ecran vide se voit et se signale ; une liste trop large
// fait travailler sur les copros des autres.
//
// `estComptable` est resolu par l'APPELANT (couche app) : le domaine des roles vit dans
// lib/auth, que les services ne peuvent pas importer (regle ESLint boundaries, ADR-001).
// Passe par le routeur, jamais un adapter en direct.

import { getAgenceRepository, getCoproRepository } from "@/lib/adapters/router";
import { getCoproprietes } from "@/lib/services/coproprietes/get-coproprietes";
import {
  aUnPerimetreComptable,
  filtrerSurPerimetreComptable,
} from "@/lib/domain/perimetre-comptable";
import type { Copropriete } from "@/lib/domain/copropriete";

export interface PerimetreUtilisateur {
  managerId: string;
  email?: string | null;
  estComptable: boolean;
}

/** Le cadrage AGENCE s'applique-t-il ? (comptable ET perimetre declare) */
function cadrageAgence(params: PerimetreUtilisateur): boolean {
  return params.estComptable && aUnPerimetreComptable(params.email);
}

/** Toutes les copros du perimetre de cet utilisateur. */
export async function getCoprosDuPerimetre(params: PerimetreUtilisateur): Promise<Copropriete[]> {
  if (!cadrageAgence(params)) return getCoproprietes(params.managerId);

  // Perimetre agence : on lit TOUTES les copros puis on filtre sur les agences du
  // comptable. La copro porte un `agenceId` technique -> resolution id -> code via la
  // table Agency (4 lignes). Table absente / agence non resolue -> copro EXCLUE.
  const [toutes, agences] = await Promise.all([
    getCoproprietes(),
    getAgenceRepository().listerAgences(),
  ]);
  const codeParId = new Map(agences.map((a) => [a.id, a.code]));
  return filtrerSurPerimetreComptable(toutes, params.email, (c) =>
    c.agenceId ? codeParId.get(c.agenceId) : undefined,
  );
}

/**
 * UNE copro, si elle est dans le perimetre de cet utilisateur - sinon null. Meme cadrage
 * que `getCoprosDuPerimetre`, mais sans charger tout le referentiel : c'est la garde
 * anti-IDOR des vues de detail (deviner une URL ne doit pas ouvrir une copro d'un autre).
 */
export async function getCoproDuPerimetre(
  coproCode: string,
  params: PerimetreUtilisateur,
): Promise<Copropriete | null> {
  const repo = getCoproRepository();
  // Gestionnaire : le cloisonnement est deja porte par la requete (managerId).
  if (!cadrageAgence(params)) return repo.findByCode(coproCode, params.managerId);

  // Comptable : resolution non bornee au portefeuille (il n'en a pas), puis filtre agence.
  const [copro, agences] = await Promise.all([
    repo.findByCode(coproCode),
    getAgenceRepository().listerAgences(),
  ]);
  if (!copro) return null;
  const codeParId = new Map(agences.map((a) => [a.id, a.code]));
  const retenues = filtrerSurPerimetreComptable([copro], params.email, (c) =>
    c.agenceId ? codeParId.get(c.agenceId) : undefined,
  );
  return retenues[0] ?? null;
}
