// Ports du module Gestion des cles (ADR-040). Ne dependent que du domaine.
//
// Trois ports : les trousseaux et leurs mouvements (ClesRepository), le referentiel des
// entreprises (ClesEntrepriseRepository, cabinet, pas cloisonne), les photos (ClesPhotoStore).
// Le journal des mouvements n'expose QUE `ajouter` et `lister` : on ne le reecrit jamais.

import type {
  Bien,
  Entreprise,
  Mouvement,
  Pret,
  Reservation,
  StatutReservation,
  Trousseau,
  TypeMouvement,
} from "@/lib/domain/cles/types";

export interface FiltreReservations {
  trousseauId?: string;
  entrepriseId?: string;
  agenceCode?: string;
  statut?: StatutReservation;
  /** Debut >= deISO. */
  deISO?: string;
  /** Debut <= aISO. */
  aISO?: string;
}

export interface FiltrePrets {
  trousseauId?: string;
  entrepriseId?: string;
  agenceCode?: string;
  /** true = ouverts seulement, false = clos seulement, absent = tous. */
  ouvert?: boolean;
  limite?: number;
}

export interface FiltreMouvements {
  agenceCode?: string;
  trousseauId?: string;
  entrepriseId?: string;
  types?: TypeMouvement[];
  deISO?: string;
  aISO?: string;
  /** Recherche libre dans le nom de l'auteur. */
  par?: string;
  page: number;
  parPage: number;
}

export interface PageMouvements {
  lignes: Mouvement[];
  total: number;
}

export type NouveauTrousseau = Omit<Trousseau, "id" | "creeLeISO" | "acces"> & { acces: Omit<Trousseau["acces"][number], "id">[] };
export type NouvelleReservation = Omit<Reservation, "id" | "creeLeISO" | "entrepriseNom">;
export type NouveauPret = Omit<Pret, "id" | "entrepriseNom">;
export type NouveauMouvement = Omit<Mouvement, "id" | "horodatageISO" | "entrepriseNom">;
export type NouvelleEntreprise = Omit<Entreprise, "id" | "creeLeISO">;

export interface ClesRepository {
  /** Trousseaux (avec leurs acces) d'une agence, ou de tout le cabinet. [] si la table est absente. */
  listerTrousseaux(agenceCode?: string): Promise<Trousseau[]>;
  getTrousseau(id: string): Promise<Trousseau | null>;
  getTrousseauParNumero(agenceCode: string, numero: string): Promise<Trousseau | null>;
  /** Les trousseaux qui ouvrent ce bien (une copro aujourd'hui). */
  listerTrousseauxDuBien(bien: Bien): Promise<Trousseau[]>;
  /** Leve si (agence, numero) existe deja. */
  creerTrousseau(t: NouveauTrousseau): Promise<Trousseau>;
  /** Remplace les champs de la fiche ET la liste des acces. */
  sauverTrousseau(t: Trousseau): Promise<void>;

  listerReservations(f: FiltreReservations): Promise<Reservation[]>;
  getReservation(id: string): Promise<Reservation | null>;
  creerReservation(r: NouvelleReservation): Promise<Reservation>;
  sauverReservation(r: Reservation): Promise<void>;

  getPretOuvert(trousseauId: string): Promise<Pret | null>;
  listerPrets(f: FiltrePrets): Promise<Pret[]>;
  getPret(id: string): Promise<Pret | null>;
  /** Leve si un pret est deja ouvert sur ce trousseau (index partiel unique). */
  creerPret(p: NouveauPret): Promise<Pret>;
  sauverPret(p: Pret): Promise<void>;

  ajouterMouvement(m: NouveauMouvement): Promise<Mouvement>;
  listerMouvements(f: FiltreMouvements): Promise<PageMouvements>;
}

export interface ClesEntrepriseRepository {
  lister(): Promise<Entreprise[]>;
  get(id: string): Promise<Entreprise | null>;
  getParNomNormalise(nomNormalise: string): Promise<Entreprise | null>;
  /** Leve si le nom normalise existe deja. */
  creer(e: NouvelleEntreprise): Promise<Entreprise>;
  sauver(e: Entreprise): Promise<void>;
}

export interface ClesPhotoStore {
  /** URL signee courte pour afficher une photo ; null si le stockage est indisponible. */
  urlSignee(chemin: string): Promise<string | null>;
  televerser(chemin: string, contenu: Uint8Array, contentType: string): Promise<void>;
}
