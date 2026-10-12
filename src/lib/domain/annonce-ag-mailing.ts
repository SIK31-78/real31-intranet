// Annonce de la prochaine AG aux copropriétaires par un mailing ESTALE (REA-144, décision
// Sekou du 12/10/2026). Logique PURE (domaine, ADR-001) : choix du modèle (présentiel ou
// hybride AG CONNECT), lieu, date limite des demandes, rendu texte + HTML, et la garde
// d'activation. Aucun appel réseau ici : le service assemble, le port ESTALE crée le
// BROUILLON, et c'est le gestionnaire qui lance l'envoi dans ESTALE après relecture.
//
// Les deux textes sont ceux fournis par le cabinet le 12/10/2026, à la lettre. Seul écart
// voulu : quand l'AG se tient à l'extérieur (lieu libre, REA-148), on n'écrit pas « à
// l'agence REAL31 », ce serait faux.

import { DELAIS_CABINET } from "@/lib/domain/jalons-ag/cabinet/real31-defaults";
import type { ModeReunion } from "@/lib/domain/confirmation-evenement";
import { adresseRessource, sallesReunion } from "@/lib/domain/salles-reunion";

export type ModeleAnnonceAg = "presentiel" | "hybride";

/** Copro de test ESTALE : le mailing y est toujours permis, même garde fermée. */
export const COPRO_TEST_MAILING = "SE999";

// ---------------------------------------------------------------------------
// Garde d'activation
// ---------------------------------------------------------------------------

/** "SE0999" / " se999 " -> "SE999" (même normalisation que la résolution ESTALE). */
function normaliserCode(code: string): string {
  const m = code.trim().toUpperCase().match(/^([A-Z]+)0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : code.trim().toUpperCase();
}

/**
 * Le mailing ESTALE peut-il être préparé pour cette copro ? Tant que
 * ESTALE_MAILING_ACTIF n'est pas exactement "1", seule la copro de test SE999 passe.
 * Renvoie la raison du refus, ou null si c'est permis.
 */
export function refusGardeMailing(coproCode: string, drapeau: string | undefined): string | null {
  if (drapeau === "1") return null;
  if (normaliserCode(coproCode) === COPRO_TEST_MAILING) return null;
  return (
    "Le mailing ESTALE n'est pas encore activé (ESTALE_MAILING_ACTIF). " +
    `Seule la copropriété de test ${COPRO_TEST_MAILING} peut servir d'essai pour l'instant.`
  );
}

// ---------------------------------------------------------------------------
// Choix du modèle
// ---------------------------------------------------------------------------

export interface ChoixModele {
  modele: ModeleAnnonceAg;
  /** Pourquoi ce modèle, affiché au gestionnaire (il peut changer de modèle). */
  raison: string;
}

/**
 * Hybride si l'AG se tient aussi en visio : d'abord le mode posé sur la date d'AG
 * (éditeur de dates), sinon l'éligibilité AG CONNECT du référentiel. Un mode « visio »
 * pur n'a pas de modèle propre : on prend l'hybride, le plus proche (à trancher).
 */
export function choisirModeleAnnonce(p: {
  modeReunion?: ModeReunion | undefined;
  agConnect?: boolean | undefined;
}): ChoixModele {
  if (p.modeReunion === "hybride") {
    return { modele: "hybride", raison: "L'AG est posée en mode hybride (présentiel et visio)." };
  }
  if (p.modeReunion === "visio") {
    return { modele: "hybride", raison: "L'AG est posée en visio : le modèle hybride est le plus proche." };
  }
  if (p.modeReunion === "presentiel") {
    return { modele: "presentiel", raison: "L'AG est posée en présentiel." };
  }
  if (p.agConnect) {
    return {
      modele: "hybride",
      raison: "Mode de l'AG non précisé, mais la copropriété utilise AG CONNECT.",
    };
  }
  return {
    modele: "presentiel",
    raison: "Mode de l'AG non précisé et pas d'AG CONNECT sur la copropriété.",
  };
}

// ---------------------------------------------------------------------------
// Date limite et lieu
// ---------------------------------------------------------------------------

/** Date limite des demandes de résolution : AG moins le barème ODJ_CS (J-45). */
export function dateLimiteDemandes(agDateISO: string): string {
  const [a, m, j] = agDateISO.split("-").map(Number);
  const d = new Date(Date.UTC(a!, m! - 1, j!));
  d.setUTCDate(d.getUTCDate() - DELAIS_CABINET.ODJ_CS_JOURS);
  return d.toISOString().slice(0, 10);
}

export interface LieuAnnonce {
  adresse: string;
  /** true = lieu libre hors du cabinet (on n'écrit pas « à l'agence REAL31 »). */
  exterieur: boolean;
}

/**
 * Où se tient l'AG. Le lieu libre saisi sur la date (REA-148) prime ; sinon l'adresse
 * de la salle réservée ; sinon l'adresse de l'agence de la copro (sa salle principale).
 * null si rien ne permet de le dire : on ne devine pas une adresse.
 */
export function lieuAnnonce(p: {
  lieuLibre?: string | undefined;
  salleEmail?: string | undefined;
  agenceCode?: string | null | undefined;
}): LieuAnnonce | null {
  const libre = p.lieuLibre?.trim();
  if (libre) return { adresse: libre, exterieur: true };
  const salle = adresseRessource(p.salleEmail);
  if (salle) return { adresse: salle, exterieur: false };
  const code = p.agenceCode?.trim().toUpperCase();
  if (!code) return null;
  const principale = sallesReunion().find((s) => s.agence === code && !s.debordement && s.adresse);
  return principale?.adresse ? { adresse: principale.adresse, exterieur: false } : null;
}

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** "2026-11-20" -> "vendredi 20 novembre 2026" (calcul en UTC : pas de fuseau). */
export function dateLongue(iso: string): string {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a!, m! - 1, j!));
  return `${JOURS[d.getUTCDay()]} ${j === 1 ? "1er" : j} ${MOIS[m! - 1]} ${a}`;
}

/** "18:30" -> "18h30", "18:00" -> "18h". */
export function heureCourte(hhmm: string): string {
  const [h, mn] = hhmm.split(":");
  return mn === "00" ? `${Number(h)}h` : `${Number(h)}h${mn}`;
}

/** « Prénom NOM » : le premier mot reste tel quel, le reste passe en capitales. */
export function signataire(nomComplet: string): string {
  const mots = nomComplet.trim().split(/\s+/).filter(Boolean);
  if (mots.length <= 1) return mots[0] ?? "";
  return [mots[0], ...mots.slice(1).map((m) => m.toUpperCase())].join(" ");
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

export interface DonneesAnnonce {
  modele: ModeleAnnonceAg;
  agDateISO: string;
  /** "HH:mm". */
  heure: string;
  lieu: LieuAnnonce;
  /** Signataire. `prenom` + `nom` (profil Signitic) priment sur `nomComplet` (session) :
   *  un prénom composé « Jean Pierre » ne doit pas passer en capitales. */
  gestionnaire: {
    nomComplet: string;
    prenom?: string | undefined;
    nom?: string | undefined;
    ligneDirecte?: string | undefined;
  };
}

export interface AnnonceRendue {
  objet: string;
  /** Texte brut (aperçu), paragraphes séparés par une ligne vide. */
  texte: string;
  /** Corps HTML du mailing (un <p> par ligne, comme l'éditeur ESTALE). */
  html: string;
  dateLimiteISO: string;
}

/** Un paragraphe = des lignes qui se suivent sans blanc. */
type Paragraphe = string[];

function paragraphesHybride(d: DonneesAnnonce, quand: string, limite: string): Paragraphe[] {
  const presentiel = d.lieu.exterieur
    ? `En présentiel : ${d.lieu.adresse}`
    : `En présentiel : à l'agence REAL 31, ${d.lieu.adresse}`;
  return [
    ["Madame, Monsieur,"],
    [
      "Nous avons le plaisir de vous informer que la prochaine assemblée générale des copropriétaires de votre résidence se tiendra en présentiel et en visio :",
      `le ${quand}`,
    ],
    [presentiel, "En visio : via AG CONNECT. Vous recevrez un lien par mail avant l'AG."],
    [
      `Si vous souhaitez y faire apparaître une demande particulière, merci de nous faire parvenir cette demande par écrit avant le ${limite}.`,
    ],
    [
      "Si vous souhaitez être candidat au Conseil Syndical qui sera constitué à la prochaine AG, nous vous remercions de nous l'indiquer par retour de mail.",
    ],
  ];
}

function paragraphesPresentiel(d: DonneesAnnonce, quand: string, limite: string): Paragraphe[] {
  const lieu = d.lieu.exterieur
    ? `En présentiel : ${d.lieu.adresse}.`
    : `En présentiel à l'agence REAL31 : ${d.lieu.adresse}.`;
  return [
    ["Madame, Monsieur,"],
    [
      "Nous avons le plaisir de vous informer que la prochaine assemblée générale des copropriétaires de votre résidence se tiendra en présentiel le :",
      quand,
    ],
    [lieu],
    [
      `Si vous avez des résolutions à inclure à l'ordre du jour, veuillez nous faire parvenir les résolutions correspondantes par écrit, accompagnées des devis le cas échéant, avant le ${limite}.`,
    ],
    [
      "Si vous souhaitez vous porter candidat au Conseil Syndical qui sera élu lors de cette Assemblée, veuillez nous en informer par retour de mail.",
    ],
    [
      "Par ailleurs, REAL31 vous propose de dématérialiser l'envoi de vos convocations ainsi que des appels de fonds.",
      "Pour ceux qui choisissent de recevoir les convocations par lettre recommandée électronique, les frais postaux seront réduits de 10 € par personne.",
      "De plus, pour chaque copropriétaire optant également pour la réception des appels de fonds par courrier électronique, nous déduirons un supplément de 3 € de nos frais postaux.",
      "Si vous faites partie d'une indivision, veuillez nous indiquer l'adresse électronique à laquelle vous préférez recevoir vos convocations.",
    ],
  ];
}

function echapperHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Rend l'annonce (objet, texte, HTML) pour le modèle choisi. Pure. */
export function rendreAnnonceAg(d: DonneesAnnonce): AnnonceRendue {
  const dateLimiteISO = dateLimiteDemandes(d.agDateISO);
  const quand = `${dateLongue(d.agDateISO)} à ${heureCourte(d.heure)}`;
  const limite = dateLongue(dateLimiteISO);
  const corps =
    d.modele === "hybride" ? paragraphesHybride(d, quand, limite) : paragraphesPresentiel(d, quand, limite);

  const { prenom, nom } = d.gestionnaire;
  const qui = prenom?.trim() && nom?.trim()
    ? `${prenom.trim()} ${nom.trim().toUpperCase()}`
    : signataire(d.gestionnaire.nomComplet);
  const signature: Paragraphe = ["Cordialement,", qui];
  // Le modèle hybride porte la ligne directe ; on l'omet si le profil ne la connaît pas.
  const ligne = d.gestionnaire.ligneDirecte?.trim();
  if (d.modele === "hybride" && ligne) signature.push(`Ligne directe : ${ligne}`);
  const paragraphes = [...corps, signature];

  const texte = paragraphes.map((p) => p.join("\n")).join("\n\n");
  const html = paragraphes
    .map((p) => p.map((l) => `<p>${echapperHtml(l)}</p>`).join(""))
    .join("<p><br></p>");
  const objet = `Prochaine assemblée générale de votre résidence : ${dateLongue(d.agDateISO)}`;
  return { objet, texte, html, dateLimiteISO };
}

// ---------------------------------------------------------------------------
// Préconditions
// ---------------------------------------------------------------------------

/**
 * Ce qui empêche de préparer l'annonce, ou null. Pas de date ou d'heure d'AG, pas de
 * lieu, ou une date limite déjà passée (le texte donnerait une échéance révolue).
 */
export function refusAnnonce(p: {
  agDateISO?: string | undefined;
  heure?: string | undefined;
  lieu: LieuAnnonce | null;
  aujourdhuiISO: string;
}): string | null {
  if (!p.agDateISO) return "Aucune date de prochaine AG n'est posée pour cette copropriété.";
  if (p.agDateISO < p.aujourdhuiISO) return "La date d'AG posée est déjà passée.";
  if (!p.heure || !/^\d{2}:\d{2}$/.test(p.heure)) {
    return "L'heure de l'AG n'est pas renseignée : posez-la dans les dates de la copropriété.";
  }
  if (!p.lieu) {
    return "Lieu de l'AG inconnu : réservez une salle ou saisissez un lieu extérieur sur la date d'AG.";
  }
  const limite = dateLimiteDemandes(p.agDateISO);
  if (limite < p.aujourdhuiISO) {
    return `La date limite des demandes (${dateLongue(limite)}, J-${DELAIS_CABINET.ODJ_CS_JOURS}) est déjà passée : l'annonce n'a plus de sens telle quelle.`;
  }
  return null;
}
