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
      return normaliserTexte(`${e.numero} ${e.libelle} ${e.biens} ${e.detenteur ?? ""} ${e.emplacement ?? ""}`);
    case "copro":
      return normaliserTexte(`${e.code} ${e.nom} ${e.adresse}`);
    case "entreprise":
      return normaliserTexte(e.nom);
  }
}

/**
 * Tous les termes doivent apparaitre (ET), sans accents ni casse. Un terme qui ressemble a
 * un numero (« r4 », « j045 ») matche aussi le numero canonique (« R004 »). Les trousseaux
 * dont le NUMERO matche exactement passent en tete.
 */
export function filtrerIndex(index: EntreeIndex[], requete: string, limite = 12): EntreeIndex[] {
  const brut = requete.trim();
  if (!brut) return [];
  const termes = normaliserTexte(brut).split(" ").filter(Boolean);
  if (termes.length === 0) return [];
  const numero = normaliserTexte(numeroCanonique(brut));
  const resultats = index.filter((e) => {
    const f = foin(e);
    if (e.kind === "trousseau" && normaliserTexte(e.numero) === numero) return true;
    return termes.every((t) => f.includes(t));
  });
  const exact = (e: EntreeIndex) => (e.kind === "trousseau" && normaliserTexte(e.numero) === numero ? 0 : 1);
  const rang = (e: EntreeIndex) => (e.kind === "trousseau" ? 0 : e.kind === "copro" ? 1 : 2);
  return resultats.sort((a, b) => exact(a) - exact(b) || rang(a) - rang(b)).slice(0, limite);
}
