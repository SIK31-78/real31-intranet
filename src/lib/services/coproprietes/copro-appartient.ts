// Service : la copro `code` est-elle dans le PERIMETRE de l'utilisateur `managerId` ?
// Sert a cloisonner les ECRITURES (les actions verifient avant de muter, les services
// re-verifient via exigerPerimetre). Passe par le routeur.
//
// DEUX perimetres, pas un (Sekou 2026-07-29) :
//   - GESTIONNAIRE : son portefeuille (findByCode(code, managerId) renvoie null hors scope).
//   - COMPTABLE    : il n'a AUCUN portefeuille -> la garde le refusait sur TOUTES les copros
//                    ("Copropriete hors du perimetre du gestionnaire"), y compris celles
//                    qu'on venait de lui afficher. Son perimetre est l'AGENCE
//                    (domain/perimetre-comptable). Elargir la LISTE sans elargir la GARDE
//                    ne servait a rien : il voyait les copros et ne pouvait rien en faire.
//
// On lit le perimetre comptable depuis le DOMAINE (liste fermee, testee), pas depuis
// lib/auth : un service ne peut pas importer l'auth (regle ESLint boundaries). Ce n'est pas
// un contournement -- la liste d'affectation EST l'autorite : un email absent n'a aucun
// perimetre agence, donc rien ne s'ouvre par defaut.

import { cache } from "react";
import { getAgenceRepository, getCoproRepository, getGestionnaireRepository } from "@/lib/adapters/router";
import { agencesDuComptable } from "@/lib/domain/perimetre-comptable";

/** La copro est-elle dans une agence tenue par ce comptable ? false des que quelque chose
 *  manque (utilisateur, email, agence de la copro non resolue) : on n'ouvre jamais au doute. */
async function dansPerimetreComptable(code: string, managerId: string): Promise<boolean> {
  const utilisateur = await getGestionnaireRepository().findById(managerId);
  const agences = agencesDuComptable(utilisateur?.email);
  if (agences.length === 0) return false;
  // Lecture TRANSVERSE (sans managerId) : par construction la copro n'est pas dans le
  // portefeuille du comptable, c'est justement le cas qu'on traite.
  const copro = await getCoproRepository().findByCode(code);
  if (!copro?.agenceId) return false;
  const codeAgence = (await getAgenceRepository().listerAgences()).find(
    (a) => a.id === copro.agenceId,
  )?.code;
  return Boolean(codeAgence) && agences.includes(codeAgence as (typeof agences)[number]);
}

// Memoise par requete (React.cache) : le meme (code, managerId) n'interroge la base
// qu'une fois, meme si l'action ET le service (exigerPerimetre) le verifient tous deux.
export const coproAppartient = cache(async (code: string, managerId: string): Promise<boolean> => {
  if ((await getCoproRepository().findByCode(code, managerId)) !== null) return true;
  // Repli comptable UNIQUEMENT : coute une lecture de plus, et seulement quand le
  // portefeuille a deja dit non (donc jamais sur le chemin nominal d'un gestionnaire).
  return dansPerimetreComptable(code, managerId);
});
