// Recherche du comptoir : un index leger (trousseaux, coproprietes, entreprises) charge
// une fois, filtre cote client avec desaccentuation et tolerance. Les volumes (quelques
// centaines de lignes) ne justifient pas une recherche serveur ; le journal, lui, est pagine.

import { normaliserTexte, numeroCanonique } from "./normaliser";
import type { EtatTrousseau } from "./types";

export interface EntreeIndexTrousseau {
  kind: "trousseau";
  id: string;
  numero: string;
  libelle: string;
  etat: EtatTrousseau;
  /** « S004 · BLEUETS6 · 6 rue des Bleuets », tous les biens du trousseau. */
  biens: string;
  /** Entreprise qui le detient, s'il est sorti. */
  detenteur?: string;
  emplacement?: string;
}

export interface EntreeIndexCopro {
  kind: "copro";
  code: string;
  nom: string;
  adresse: string;
  /** Nombre de trousseaux rattaches. */
  trousseaux: number;
  gestionnaire?: string;
  assistant?: string;
}

export interface EntreeIndexEntreprise {
  kind: "entreprise";
  id: string;
  nom: string;
  /** Trousseaux detenus, en retard. */
  detenus: number;
  enRetard: number;
  bloquee: boolean;
}

export type EntreeIndex = EntreeIndexTrousseau | EntreeIndexCopro | EntreeIndexEntreprise;

function foin(e: EntreeIndex): string {
  switch (e.kind) {
    case "trousseau":
      // Un trousseau se cherche par son numero, son libelle, son emplacement ou l'entreprise
      // qui l'a : PAS par sa copro. « canopea » donne la copro CANOPEA (avec ses 8 trousseaux
      // derriere), pas 8 lignes indistinctes (Sekou, 18/09).
      return normaliserTexte(`${e.numero} ${e.libelle} ${e.detenteur ?? ""} ${e.emplacement ?? ""}`);
    case "copro":
      return normaliserTexte(`${e.code} ${e.nom} ${e.adresse} ${e.gestionnaire ?? ""} ${e.assistant ?? ""}`);
    case "entreprise":
      return normaliserTexte(e.nom);
  }
}

/**
 * Tous les termes doivent apparaitre (ET), sans accents ni casse. Un terme qui ressemble a
 * un numero (« r4 », « j045 ») matche le numero canonique (« R004 »). Ordre : le trousseau
 * dont le numero est exactement celui tape, puis les coproprietes, les entreprises, et
 * enfin les trousseaux trouves par libelle ou detenteur.
 */
export function filtrerIndex(index: EntreeIndex[], requete: string, limite = 12): EntreeIndex[] {
  const brut = requete.trim();
  if (!brut) return [];
  const termes = normaliserTexte(brut).split(" ").filter(Boolean);
  if (termes.length === 0) return [];
  const numero = normaliserTexte(numeroCanonique(brut));
  const exactNumero = (e: EntreeIndex) => e.kind === "trousseau" && normaliserTexte(e.numero) === numero;
  const resultats = index.filter((e) => exactNumero(e) || termes.every((t) => foin(e).includes(t)));
  const rang = (e: EntreeIndex) => (exactNumero(e) ? 0 : e.kind === "copro" ? 1 : e.kind === "entreprise" ? 2 : 3);
  return resultats.sort((a, b) => rang(a) - rang(b)).slice(0, limite);
}
