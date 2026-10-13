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
// DELEGATIONS (REA-158) : le perimetre agence d'un comptable s'elargit de ses delegations
// datees actives (agence deleguee, portefeuille d'une collegue comptable : cf.
// perimetreComptableDe), et les copros que lui ouvre le perimetre d'ecriture (delegation
// d'une copro, du portefeuille d'un gestionnaire) s'y ajoutent. Ses conges finis, la
// delegation expire et le perimetre revient seul a ses agences.
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
import { coproAppartient, perimetreComptableDe } from "@/lib/services/coproprietes/copro-appartient";
import { coprosEcrivables } from "@/lib/services/coproprietes/perimetre-ecriture";
import { filtrerSurAgences } from "@/lib/domain/perimetre-comptable";
import type { Copropriete } from "@/lib/domain/copropriete";

export interface PerimetreUtilisateur {
  managerId: string;
  email?: string | null;
  estComptable: boolean;
}

/** Les agences du cadrage AGENCE (comptable ET perimetre declare ou delegue) ; [] sinon. */
async function agencesDuCadrage(params: PerimetreUtilisateur): Promise<string[]> {
  if (!params.estComptable) return [];
  return (await perimetreComptableDe(params.managerId, params.email)).agences;
}

/** Toutes les copros du perimetre de cet utilisateur. */
export async function getCoprosDuPerimetre(params: PerimetreUtilisateur): Promise<Copropriete[]> {
  // Gestionnaire, directeur, referent, remplacant : son perimetre d'ECRITURE (ADR-041) —
  // le portefeuille, plus ce que le role et les delegations lui ouvrent.
  const agencesComptables = await agencesDuCadrage(params);
  if (agencesComptables.length === 0) return coprosEcrivables(params.managerId);

  // Perimetre agence : on lit TOUTES les copros puis on filtre sur les agences du
  // comptable. La copro porte un `agenceId` technique -> resolution id -> code via la
  // table Agency (4 lignes). Table absente / agence non resolue -> copro EXCLUE.
  // Plus son perimetre d'ecriture (delegation d'une copro ou du portefeuille d'un
  // gestionnaire) : sans delegation, c'est son portefeuille, vide en pratique.
  const [toutes, agences, ecrivables] = await Promise.all([
    getCoproprietes(),
    getAgenceRepository().listerAgences(),
    coprosEcrivables(params.managerId),
  ]);
  const codeParId = new Map(agences.map((a) => [a.id, a.code]));
  const parAgence = filtrerSurAgences(toutes, agencesComptables, (c) =>
    c.agenceId ? codeParId.get(c.agenceId) : undefined,
  );
  const vues = new Set(parAgence.map((c) => c.code));
  return [...parAgence, ...ecrivables.filter((c) => !vues.has(c.code))];
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
  // Gestionnaire : le portefeuille par la requete (managerId), sinon la porte d'ecriture
  // (role, delegation) puis une lecture non bornee.
  const agencesComptables = await agencesDuCadrage(params);
  if (agencesComptables.length === 0) {
    const mienne = await repo.findByCode(coproCode, params.managerId);
    if (mienne) return mienne;
    return (await coproAppartient(coproCode, params.managerId)) ? repo.findByCode(coproCode) : null;
  }

  // Comptable : resolution non bornee au portefeuille (il n'en a pas), puis filtre agence
  // (delegations comprises) ; a defaut, la porte d'ecriture (delegation d'une copro...).
  const [copro, agences] = await Promise.all([
    repo.findByCode(coproCode),
    getAgenceRepository().listerAgences(),
  ]);
  if (!copro) return null;
  const codeParId = new Map(agences.map((a) => [a.id, a.code]));
  const retenues = filtrerSurAgences([copro], agencesComptables, (c) =>
    c.agenceId ? codeParId.get(c.agenceId) : undefined,
  );
  if (retenues[0]) return retenues[0];
  return (await coproAppartient(coproCode, params.managerId)) ? copro : null;
}
