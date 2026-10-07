// L'ODJ du CS **tel qu'il a ete rempli en ligne**, en ARBRE DE RENDU PUR.
//
// Pourquoi un arbre (decision Sekou du 2026-10-07, ticket REA-132). Le Word existant
// (odj-docx.ts) remplit le GABARIT du cabinet : 44 balises, des blancs partout, la voie de
// ceux qui remplissent le document en reunion (REA-62). Il ne sait rien de ce que le module
// en ligne permet : paragraphes libres, notes ancrees sous une ligne, champs ajoutes,
// libelles et titres reecrits, points reglementaires retenus, heure de fin. Un gabarit fige
// n'a d'ailleurs aucun emplacement pour une note ancree sous une ligne quelconque.
//
// On reprend donc le parti de l'ADR-012 v3 (contrat de syndic) : UN arbre pur dans le
// domaine, dessine par plusieurs sorties. Ici : l'ecran (components/odj/document-odj), le
// Word (adapters/docx/odj-rempli-docx-renderer) et l'HTML A4 du PDF (odj-html).
//
// Domaine PUR : aucune I/O, aucune horloge (la seule date lue est celle de la cloture,
// portee par l'ODJ lui-meme). Testable sans Word ni navigateur.

import type { ChampOdj, Odj, SectionOdj } from "./odj";
import { formatChampValeur } from "./odj";
import { lignesMentions, mentionsAgence } from "./mentions-agences";

/** Un noeud de document. Volontairement pauvre : ce que les trois dessins savent rendre. */
export type NoeudOdj =
  /** "Libelle : valeur". `paragraphe` = la valeur passe SOUS le libelle (cf. estParagraphe). */
  | { type: "ligne"; libelle: string; valeur: string; paragraphe: boolean }
  /** Paragraphe libre : bloc de section, note ancree, ou ajout de fin de document. */
  | { type: "paragraphe"; texte: string }
  /** Point reglementaire retenu : son titre, puis son texte legal. */
  | { type: "point"; titre: string; texte: string };

export interface SectionRendue {
  /** Numero affiche ("1.", "2." ...). Les points reglementaires closent la numerotation. */
  numero: number;
  titre: string;
  noeuds: NoeudOdj[];
}

export interface ArbreOdj {
  /** Titre du document, en en-tete de marque. */
  titre: string;
  sousTitre: string;
  copro: { nom: string; code: string; adresse: string };
  /** L'encadre "reunion" : qui, quand, ou. Que des lignes. */
  reunion: NoeudOdj[];
  /** Les sections numerotees, points reglementaires compris (toujours en dernier). */
  sections: SectionRendue[];
  /** Les paragraphes ajoutes en FIN de document par le gestionnaire. */
  blocsFin: string[];
  /** Heure de fin de reunion, "" si elle n'est ni saisie ni deduite de la cloture. */
  finReunion: string;
  /** Mentions legales de l'agence, une par ligne de pied de page. */
  mentions: string[];
}

const TITRE = "Préparation d'assemblée générale";
const SOUS_TITRE = "Document issu du conseil syndical";
const TITRE_POINTS = "Points réglementaires à l'ordre du jour";

/** Une valeur de section se rend-elle en PARAGRAPHE sous son titre (plutot qu'inline) ?
 *  Regle (retour collegue 2026-09-01, "des lignes qui ne sont pas d'office en saut de
 *  ligne") : TOUT texte renseigne passe sous le titre, comme leur ODJ Word. Seuls les
 *  montants/pourcentages (courts par nature) et les champs vides restent inline.
 *
 *  Vit ICI, dans le domaine, et pas dans le composant : l'ecran, le Word et le PDF doivent
 *  couper au MEME endroit, sinon les trois documents ne se ressemblent plus. */
export function estParagraphe(champ: { type?: string; valeur?: string } | undefined, v?: string): boolean {
  if (!v) return false;
  return !champ?.type || champ.type === "texte";
}

/** Heure de cloture du CS, fuseau cabinet (Europe/Paris) EXPLICITE : le meme rendu cote
 *  serveur (UTC Vercel) et cote client, sinon mismatch d'hydratation. */
export function heureCloture(iso: string): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const f = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d);
  return f.replace(":", "h");
}

/** Fin de reunion : la saisie prime, sinon l'heure de cloture, sinon rien. L'heure de
 *  cloture n'est qu'une approximation (clore le lendemain ecrivait une heure fausse,
 *  remontee collegue du 07/10/2026) - d'ou la saisie, et d'ou cet ordre. */
export function finReunionLisible(odj: Odj): string | undefined {
  return odj.finReunion ?? (odj.cloture ? heureCloture(odj.cloture.le) : undefined);
}

function champ(champs: ChampOdj[], id: string): ChampOdj | undefined {
  return champs.find((c) => c.id === id);
}

/** Une ligne d'ENCADRE REUNION : libelle sobre, valeur telle qu'affichee, jamais en
 *  paragraphe (ce sont des dates, un lieu, des noms). Un champ masque disparait. */
function ligneReunion(champs: ChampOdj[], id: string, libelle: string): NoeudOdj | undefined {
  const c = champ(champs, id);
  if (c?.masque) return undefined;
  return { type: "ligne", libelle, valeur: (c ? formatChampValeur(c) : undefined) ?? "", paragraphe: false };
}

/** Les noeuds d'une section : chaque ligne non masquee, suivie de ses notes ANCREES, puis
 *  les paragraphes libres de la section. Exactement l'ordre de l'ecran. */
function noeudsSection(s: SectionOdj): NoeudOdj[] {
  const noeuds: NoeudOdj[] = [];
  for (const c of s.champs) {
    // Champ MASQUE : retire du document par le gestionnaire. Ses notes, elles, le suivent
    // (l'ecran fait de meme : "meme masquee, la note reste").
    if (!c.masque) {
      const v = formatChampValeur(c) ?? "";
      noeuds.push({ type: "ligne", libelle: c.libelle, valeur: v, paragraphe: estParagraphe(c, v) });
    }
    for (const n of c.notes ?? []) if (n.texte.trim()) noeuds.push({ type: "paragraphe", texte: n.texte });
  }
  for (const b of s.blocs ?? []) if (b.texte.trim()) noeuds.push({ type: "paragraphe", texte: b.texte });
  return noeuds;
}

/** L'arbre complet. Tout ce qui est a l'ecran y est, rien de plus. */
export function arbreOdj(odj: Odj): ArbreOdj {
  const visio = champ(odj.enTete, "visio");
  const reunion: NoeudOdj[] = [
    ligneReunion(odj.enTete, "date-cs", "Conseil syndical du"),
    ligneReunion(odj.enTete, "presents-syndic", "Pour le syndic"),
    ligneReunion(odj.enTete, "presents-cs", "Pour le conseil syndical"),
    ligneReunion(odj.enTete, "date-ag", "Assemblée générale fixée au"),
    ligneReunion(odj.enTete, "lieu", "Lieu"),
    // Modalite : libelles specifiques au booleen visio, comme a l'ecran (une copro sans
    // reponse est en presentiel, c'est le cas general).
    {
      type: "ligne",
      libelle: "Modalité",
      valeur: visio?.valeur === "oui" ? "Présentiel et visio (hybride)" : "Présentiel",
      paragraphe: false,
    },
    ligneReunion(odj.enTete, "limite-odj", "Limite d'ajout de points à l'ODJ"),
    ligneReunion(odj.enTete, "mise-sous-pli", "Mise sous pli de la convocation"),
  ].filter((n): n is NoeudOdj => n !== undefined);

  const sections: SectionRendue[] = odj.sections.map((s, i) => ({
    numero: i + 1,
    titre: s.titre,
    noeuds: noeudsSection(s),
  }));

  // Les points reglementaires closent la numerotation, comme a l'ecran. Seuls les points
  // RETENUS (applicable) sont au document : c'est le tri fait en ligne.
  const points = odj.pointsLegaux.filter((p) => p.applicable);
  sections.push({
    numero: sections.length + 1,
    titre: TITRE_POINTS,
    noeuds: points.map((p) => ({ type: "point", titre: p.titre, texte: p.texte })),
  });

  return {
    titre: TITRE,
    sousTitre: SOUS_TITRE,
    copro: odj.copro,
    reunion,
    sections,
    blocsFin: (odj.blocsLibres ?? []).map((b) => b.texte).filter((t) => t.trim()),
    finReunion: finReunionLisible(odj) ?? "",
    mentions: lignesMentions(mentionsAgence(odj.agence)),
  };
}

/** Nom de fichier d'un ODJ rempli, sans extension : "ODJ rempli - S146 - 2026-11-16".
 *  Les caracteres interdits par Windows sont retires ; les accents, eux, restent (les
 *  reponses HTTP portent `filename*` en UTF-8). */
export function nomFichierOdjRempli(odj: Odj): string {
  const sujet = (odj.copro.code || odj.copro.nom || "copropriete").replace(/[\\/:*?"<>|]+/g, " ").trim();
  const dateCs = champ(odj.enTete, "date-cs")?.valeur;
  const date = dateCs ? dateCs.slice(0, 10) : (odj.dateAgISO ?? "sans-date");
  // Une date de CS est saisie en jj/mm/aaaa : on la remet en ISO pour que les fichiers
  // se trient dans l'ordre chronologique dans le dossier de telechargement.
  const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(date) ? date.split("/").reverse().join("-") : date;
  return `ODJ rempli - ${sujet} - ${iso}`;
}
