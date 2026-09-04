// PERIMETRE DE LECTURE : ce qu'un collaborateur peut CONSULTER. A ne pas confondre avec
// le perimetre d'ECRITURE, qui reste son PORTEFEUILLE (copro-appartient / exiger-perimetre).
//
// POURQUOI (decision Sekou, 2026-09-04, sur deux plaintes d'Emmanuel LOPES) :
//   - "la recherche ne fonctionne que sur mes copros, pas celles de toute l'equipe" ;
//   - "je veux consulter le CR de CS prepare par Fanny, j'appuie sur ODJ -> 404".
// Meme cause : le cloisonnement par managerId, concu pour proteger les ECRITURES, bloquait
// aussi la CONSULTATION. Regle retenue : la LECTURE s'elargit a l'equipe, l'ECRITURE reste
// cloisonnee au gestionnaire de la copro. Aucune garde d'ecriture n'est touchee.
//
// LE PERIMETRE RETENU = LE CABINET (toutes les copros actives), pas l'agence :
//   - l'intranet n'a AUCUNE notion d'equipe en base (pas de table, pas de colonne) ;
//   - l'agence existe (User.agencyId / Copropriete.agencyId) mais elle est souvent NULLE.
//     Un cadrage agence renverrait une liste VIDE a qui n'a pas d'agence declaree :
//     exactement le bug qu'on repare, et en silencieux ;
//   - c'est deja le perimetre que l'app calcule pour la vue TRANSVERSE de "Toutes les
//     coproprietes" et pour le dashboard comptable. On en REUTILISE un, on n'en cree pas.
//
// Tout le monde est un collaborateur REAL31 authentifie (SSO Entra) : il n'y a pas de
// donnee plus sensible d'une agence a l'autre. Resserrer plus tard (agence, equipe) =
// changer CE fichier, pas quatre ecrans.
//
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import { getCoproRepository } from "@/lib/adapters/router";
import type { Copropriete } from "@/lib/domain/copropriete";

/**
 * Toutes les copros CONSULTABLES par un collaborateur, EQUIPE RESOLUE (`listerToutes`) :
 * la recherche doit pouvoir dire qui gere quoi. `list()` ne resout pas l'equipe en mode
 * Supabase - c'est pour ca qu'on ne l'utilise pas ici.
 */
export async function coprosEnLecture(): Promise<Copropriete[]> {
  return getCoproRepository().listerToutes();
}

/**
 * UNE copro consultable, ou null si elle n'existe pas. Lecture NON cloisonnee (sans
 * managerId) : c'est le propre du perimetre de lecture. Ce n'est PAS un droit d'ecrire -
 * pour ca, et seulement ca, il y a `coproAppartient` / `exigerPerimetre`.
 */
export async function coproEnLecture(code: string): Promise<Copropriete | null> {
  return getCoproRepository().findByCode(code);
}
