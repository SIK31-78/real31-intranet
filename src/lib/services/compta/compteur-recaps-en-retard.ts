// Nombre de recaps d'AG EN RETARD de l'utilisateur, pour la pastille rouge de l'entree
// « Récap AG » de la barre laterale (demande de Sekou, 12/10/2026, sur le modele de la
// pastille du tri des e-mails).
//
// MEME DEFINITION que l'alerte de /recap-ag (variante « gestionnaire ») : on rappelle
// listerRecapsEnRetard avec le perimetre PORTEFEUILLE (estComptable: false), jamais une
// regle recopiee. La file comptable des recaps recus (/comptabilite/recaps) n'entre pas
// dans ce compte : ce sont des recaps PRESENTS, ici on compte des recaps ABSENTS.
//
// COUT : la barre laterale s'affiche sur TOUTES les pages. Le calcul complet (perimetre +
// referentiel copros + dates de recap) coute ~200 ms a chaud et ~2 s sur une instance
// froide (login ESTALE). D'ou :
//   - une memoire de 5 min par utilisateur (par instance serveur) ;
//   - passe ce delai, on rend la valeur connue TOUT DE SUITE et on recalcule en tache de
//     fond (une seule fois a la fois) : seul le tout premier affichage attend ;
//   - ce premier calcul est abandonne au-dela de 1,5 s (pas de pastille plutot qu'une page
//     lente), mais il continue et remplit la memoire pour la page suivante ;
//   - React `cache` dedoublonne les appels d'un meme rendu.
// Un echec ne leve jamais : pas de pastille, le shell s'affiche.

import { cache } from "react";
import { listerRecapsEnRetard } from "@/lib/services/compta/recaps-en-retard";
import { jourParis } from "@/lib/services/date-du-jour";

const TTL_MS = 5 * 60_000;
const DELAI_MAX_MS = 1_500;

const memoire = new Map<string, { valeur: number; expire: number }>();
const enCours = new Map<string, Promise<number>>();

function calculer(managerId: string, email: string | null): Promise<number> {
  const deja = enCours.get(managerId);
  if (deja) return deja;
  const calcul = listerRecapsEnRetard({ managerId, email, estComptable: false }, jourParis())
    .then((lignes) => {
      retenirRecapsEnRetard(managerId, lignes.length);
      return lignes.length;
    })
    .finally(() => enCours.delete(managerId));
  enCours.set(managerId, calcul);
  return calcul;
}

async function compter(managerId: string, email: string | null): Promise<number | null> {
  try {
    const connu = memoire.get(managerId);
    if (connu) {
      // Perime : on sert la valeur connue et on rafraichit sans faire attendre la page.
      if (Date.now() >= connu.expire) calculer(managerId, email).catch(() => {});
      return connu.valeur;
    }
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    const delai = new Promise<null>((resoudre) => {
      minuteur = setTimeout(() => resoudre(null), DELAI_MAX_MS);
    });
    const calcul = calculer(managerId, email);
    calcul.catch(() => {});
    try {
      return await Promise.race([calcul, delai]);
    } finally {
      clearTimeout(minuteur);
    }
  } catch {
    return null;
  }
}

/** Recaps en retard du collaborateur connecte ; null = inconnu (pas de pastille). */
export const compterRecapsEnRetard = cache(compter);

/**
 * La page /recap-ag calcule deja la liste complete : elle la pose ici pour que la pastille
 * suive tout de suite (un recap saisi la fait baisser sans attendre les 5 min).
 */
export function retenirRecapsEnRetard(managerId: string, valeur: number): void {
  memoire.set(managerId, { valeur, expire: Date.now() + TTL_MS });
}

/** Pour les tests : repart d'une memoire vide. */
export function oublierRecapsEnRetard(): void {
  memoire.clear();
  enCours.clear();
}
