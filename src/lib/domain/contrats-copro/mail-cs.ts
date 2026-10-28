// Le mail au conseil syndical du module « Contrats & contrôles » (plan §3 point 19, décision 9) :
// comparatif des offres d'assurance ou de gaz, devis CTQ unique ou comparatif des devis.
// Fonctions PURES : les variables d'un modèle, le tableau des offres, la composition du
// corps, les destinataires. L'envoi, les modèles en base et la signature sont l'affaire du
// service (src/lib/services/contrats-copro/mail-cs.ts).
//
// Les 6 modèles vivent dans intranet_mail_modeles (seed supabase/sql/intranet_contrats_
// modeles_mail_seed.sql) : leur en-tête est le CONTRAT des variables reprises ici. Le
// marqueur {{offres}} n'est pas une variable : le corps est coupé sur le PREMIER {{offres}}
// et le tableau (HTML inline, Outlook-safe) est posé entre les deux morceaux.
//
// Pas de préfixe « CODE · Nom · Adresse » dans l'objet : les modèles portent déjà la copro.

import { formatEuros } from "@/lib/domain/format-montant";
import { formatJourFR } from "./dates";
import { LIBELLE_TYPE_PRIX_GAZ, type ContratCourant, type DevisCtq, type OffreAssurance, type OffreGaz, type SujetSuivi } from "./types";

export type VarianteMailCs = "comparatif" | "devis_unique";

/** Le marqueur de section du tableau dans le corps d'un modèle. */
export const MARQUEUR_OFFRES = "{{offres}}";

/** Les titres EXACTS du seed. Assurance et gaz n'ont qu'un comparatif. */
const TITRES_MODELE_CS: Record<SujetSuivi, Record<VarianteMailCs, string>> = {
  assurance: {
    comparatif: "Contrats : comparatif des propositions d'assurance",
    devis_unique: "Contrats : comparatif des propositions d'assurance",
  },
  gaz: {
    comparatif: "Contrats : comparatif des offres gaz",
    devis_unique: "Contrats : comparatif des offres gaz",
  },
  ctq_ascenseur: {
    comparatif: "Contrats : comparatif des devis CTQ ascenseur",
    devis_unique: "Contrats : devis CTQ ascenseur",
  },
  ctq_vmc: {
    comparatif: "Contrats : comparatif des devis VMC gaz",
    devis_unique: "Contrats : devis VMC gaz",
  },
};

export function titreModeleCs(sujet: SujetSuivi, variante: VarianteMailCs): string {
  return TITRES_MODELE_CS[sujet][variante];
}

/** Les variantes qui ont un sens pour un sujet (assurance et gaz : comparatif seulement). */
export function variantesPourSujet(sujet: SujetSuivi): VarianteMailCs[] {
  return sujet === "ctq_ascenseur" || sujet === "ctq_vmc" ? ["comparatif", "devis_unique"] : ["comparatif"];
}

// --- Variables -------------------------------------------------------------------------

const VIDE = "-";

function euros(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? formatEuros(n, { decimales: "auto" }) : VIDE;
}

function jour(iso: string | null | undefined): string {
  return iso ? formatJourFR(iso) : VIDE;
}

function texte(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  return t || VIDE;
}

export interface DonneesOffresMailCs {
  offresAssurance?: readonly OffreAssurance[];
  offresGaz?: readonly OffreGaz[];
  devis?: readonly DevisCtq[];
  /** Assurance et gaz : l'offre retenue sur le cycle (ligne en gras, « (retenue) »). */
  offreRetenueId?: string | null;
  /** CTQ : le devis retenu de la copro pour le sujet. */
  devisRetenuId?: string | null;
}

/** Les offres et devis qui comptent : jamais une ligne supprimée. */
function vivantes<T extends { supprimeeLeISO?: string | null }>(l: readonly T[] | undefined): T[] {
  return (l ?? []).filter((x) => !x.supprimeeLeISO);
}

/** Le devis à citer dans un mail « devis unique » : le retenu, sinon l'unique reçu, sinon rien. */
export function devisCite(devis: readonly DevisCtq[] | undefined, devisRetenuId: string | null | undefined): DevisCtq | null {
  const l = vivantes(devis);
  if (devisRetenuId) {
    const retenu = l.find((d) => d.id === devisRetenuId);
    if (retenu) return retenu;
  }
  return l.length === 1 ? l[0] : null;
}

/**
 * Les variables d'un modèle « Contrats : … » pour une copro. Toutes les clés du contrat des
 * variables sont rendues (un modèle d'assurance peut citer le gaz par erreur : il verra « - »,
 * pas « [contrat_actuel_fournisseur] »). `contrat_actuel_echeance` suit le sujet.
 */
export function variablesMailCs(p: {
  sujet: SujetSuivi;
  copro: { code: string; nom: string };
  contrat: ContratCourant;
} & DonneesOffresMailCs): Record<string, string> {
  const { contrat, sujet } = p;
  const devis = devisCite(p.devis, p.devisRetenuId);
  const echeance = sujet === "assurance" ? contrat.assurance.echeanceISO : sujet === "gaz" ? contrat.gaz.echeanceISO : null;
  return {
    copro_nom: p.copro.nom,
    copro_code: p.copro.code,
    contrat_actuel_fournisseur: texte(contrat.gaz.fournisseur),
    contrat_actuel_type_prix: contrat.gaz.typePrix ? LIBELLE_TYPE_PRIX_GAZ[contrat.gaz.typePrix] : VIDE,
    contrat_actuel_montant: euros(contrat.gaz.montant),
    contrat_actuel_echeance: jour(echeance),
    contrat_actuel_assureur: texte(contrat.assurance.compagnie),
    contrat_actuel_prime: euros(contrat.assurance.prime),
    devis_prestataire: devis ? texte(devis.prestataire) : VIDE,
    devis_montant: devis ? euros(devis.montant) : VIDE,
  };
}

// --- Tableau des offres ------------------------------------------------------------------

export function echapperHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const CELLULE = "border:1px solid #ccc;padding:6px;";
const STYLE_TABLE = "border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;color:#222;";
const STYLE_RETENUE = ' style="font-weight:bold;background:#eef7f0;"';
export const AUCUNE_PROPOSITION = "Aucune proposition reçue à ce jour.";

interface Colonne {
  titre: string;
  numerique?: boolean;
}

interface LigneTableau {
  cellules: string[];
  retenue: boolean;
}

/** « (retenue) » pour une offre, « (retenu) » pour un devis. */
function motRetenu(sujet: SujetSuivi): string {
  return sujet === "ctq_ascenseur" || sujet === "ctq_vmc" ? " (retenu)" : " (retenue)";
}

function tableHtml(colonnes: Colonne[], lignes: LigneTableau[], retenu: string): string {
  if (lignes.length === 0) return `<p style="font-family:Arial,sans-serif;font-size:13px;color:#222;">${echapperHtml(AUCUNE_PROPOSITION)}</p>`;
  const tete = colonnes.map((c) => `<th align="${c.numerique ? "right" : "left"}" style="${CELLULE}">${echapperHtml(c.titre)}</th>`).join("");
  const corps = lignes
    .map((l) => {
      const tds = l.cellules
        .map((v, i) => `<td${colonnes[i]?.numerique ? ' align="right"' : ""} style="${CELLULE}">${echapperHtml(v)}${i === 0 && l.retenue ? retenu : ""}</td>`)
        .join("");
      return `<tr${l.retenue ? STYLE_RETENUE : ""}>${tds}</tr>`;
    })
    .join("");
  return `<table cellpadding="6" cellspacing="0" border="0" style="${STYLE_TABLE}"><thead><tr>${tete}</tr></thead><tbody>${corps}</tbody></table>`;
}

function tableTexte(colonnes: Colonne[], lignes: LigneTableau[], retenu: string): string {
  if (lignes.length === 0) return AUCUNE_PROPOSITION;
  return lignes
    .map((l) => {
      const [nom, ...reste] = l.cellules;
      const details = reste.map((v, i) => `${colonnes[i + 1]?.titre.toLowerCase() ?? ""} ${v}`.trim()).join(", ");
      return `- ${nom}${l.retenue ? retenu : ""} : ${details}`;
    })
    .join("\n");
}

function lignesDe(sujet: SujetSuivi, p: DonneesOffresMailCs): { colonnes: Colonne[]; lignes: LigneTableau[] } {
  switch (sujet) {
    case "assurance":
      return {
        colonnes: [{ titre: "Assureur" }, { titre: "Prime proposée", numerique: true }, { titre: "Franchise", numerique: true }, { titre: "Garanties" }, { titre: "Reçue le" }],
        lignes: vivantes(p.offresAssurance).map((o) => ({
          cellules: [o.assureur, euros(o.prime), euros(o.franchise), texte(o.garanties), jour(o.recueLeISO)],
          retenue: !!p.offreRetenueId && o.id === p.offreRetenueId,
        })),
      };
    case "gaz":
      return {
        colonnes: [{ titre: "Fournisseur" }, { titre: "Type de prix" }, { titre: "Montant", numerique: true }, { titre: "Durée", numerique: true }, { titre: "Reçue le" }],
        lignes: vivantes(p.offresGaz).map((o) => ({
          cellules: [o.fournisseur, LIBELLE_TYPE_PRIX_GAZ[o.typePrix] ?? texte(o.typePrix), euros(o.montant), `${o.dureeMois} mois`, jour(o.recueLeISO)],
          retenue: !!p.offreRetenueId && o.id === p.offreRetenueId,
        })),
      };
    case "ctq_ascenseur":
    case "ctq_vmc":
      return {
        colonnes: [{ titre: "Prestataire" }, { titre: "Montant", numerique: true }, { titre: "Reçu le" }],
        lignes: vivantes(p.devis)
          .filter((d) => d.sujet === sujet)
          .map((d) => ({ cellules: [d.prestataire, euros(d.montant), jour(d.recueLeISO)], retenue: !!p.devisRetenuId && d.id === p.devisRetenuId })),
      };
  }
}

/** Le tableau des offres (ou devis) en deux rendus : HTML inline pour le mail, lignes pour le texte. */
export function tableauOffres(sujet: SujetSuivi, p: DonneesOffresMailCs): { html: string; texte: string; nombre: number } {
  const { colonnes, lignes } = lignesDe(sujet, p);
  const retenu = motRetenu(sujet);
  return { html: tableHtml(colonnes, lignes, retenu), texte: tableTexte(colonnes, lignes, retenu), nombre: lignes.length };
}

/** Tableau HTML inline (Outlook-safe), valeurs échappées ; vide -> « Aucune proposition reçue à ce jour. » */
export function tableauOffresHtml(sujet: SujetSuivi, p: DonneesOffresMailCs): string {
  return tableauOffres(sujet, p).html;
}

// --- Composition ---------------------------------------------------------------------------

const STYLE_PARAGRAPHE = "font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt";

/** Un bloc de texte en HTML : échappé, un <br> par retour à la ligne, police du cabinet. */
export function blocTexteHtml(texte: string): string {
  return `<div style="${STYLE_PARAGRAPHE}">${echapperHtml(texte).replace(/\n/g, "<br>\n")}</div>`;
}

/**
 * Substitue les {{variables}} d'un gabarit : connue -> sa valeur, inconnue -> « [cle] » visible
 * (jamais un {{…}} résiduel). Le marqueur {{offres}} est laissé tel quel : c'est une section.
 */
export function remplirModeleCs(gabarit: string, variables: Record<string, string>): string {
  return gabarit.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (brut, cle: string) => {
    const k = cle.toLowerCase();
    if (k === "offres") return MARQUEUR_OFFRES;
    return k in variables ? variables[k] : `[${cle}]`;
  });
}

/** Coupe un texte sur le PREMIER marqueur ; après = "" s'il n'y en a pas. */
export function couperSurOffres(texte: string): { avant: string; apres: string; marqueur: boolean } {
  const i = texte.indexOf(MARQUEUR_OFFRES);
  if (i === -1) return { avant: texte, apres: "", marqueur: false };
  // Un second {{offres}} n'a pas de sens : il disparaît.
  const apres = texte.slice(i + MARQUEUR_OFFRES.length).split(MARQUEUR_OFFRES).join("");
  return { avant: texte.slice(0, i), apres, marqueur: true };
}

const nettoyer = (s: string) => s.replace(/\n{3,}/g, "\n\n");

/**
 * Un texte (marqueur compris) rendu en HTML, le tableau posé à la place du PREMIER {{offres}}.
 * `tableauHtml` null = le marqueur disparaît (tableau exclu par le gestionnaire, ou modèle
 * sans tableau). Sert à la prévisualisation et à l'envoi, sur le texte édité.
 */
export function texteVersHtmlMailCs(texte: string, tableauHtml: string | null): string {
  const { avant, apres, marqueur } = couperSurOffres(texte);
  if (!marqueur || !tableauHtml) {
    const seul = nettoyer(`${avant}${apres}`).trim();
    return blocTexteHtml(seul);
  }
  const morceaux = [blocTexteHtml(nettoyer(avant).replace(/\s+$/, "")), tableauHtml];
  const suite = nettoyer(apres).replace(/^\s+/, "").replace(/\s+$/, "");
  if (suite) morceaux.push(blocTexteHtml(suite));
  return morceaux.join("");
}

/** Le même texte en clair : le tableau devient ses lignes « - X : … » (ou rien si exclu). */
export function texteVersTexteMailCs(texte: string, tableauTexte: string | null): string {
  const { avant, apres, marqueur } = couperSurOffres(texte);
  if (!marqueur) return nettoyer(texte).trim();
  // Le tableau prend la place du marqueur, une ligne vide le sépare de la suite ; sans
  // tableau, il reste la ligne vide (même rendu que le HTML).
  const milieu = tableauTexte ? `\n${tableauTexte}\n\n` : "\n\n";
  return nettoyer(`${avant.replace(/\s+$/, "")}${milieu}${apres.replace(/^\s+/, "")}`).trim();
}

export interface MailCsCompose {
  objet: string;
  /** Le texte à ÉDITER : variables remplies, {{offres}} laissé là où le tableau ira. */
  corpsEditable: string;
  /** Le texte prêt à partir (tableau en lignes) : le `corps` du fournisseur de mail. */
  corpsTexte: string;
  /** Le rendu HTML (tableau inline) : prévisualisation et `corpsHtml` du fournisseur. */
  corpsHtml: string;
}

/**
 * Compose le mail depuis un modèle : objet et corps substitués, corps coupé sur le premier
 * {{offres}}, tableau entre les deux morceaux. Sans tableau (null), le marqueur disparaît.
 */
export function composerMailCs(p: {
  sujetModele: string;
  corpsModele: string;
  variables: Record<string, string>;
  tableau: { html: string; texte: string } | null;
}): MailCsCompose {
  // L'objet ne porte jamais de tableau : un {{offres}} qui s'y serait glissé disparaît.
  const objet = couperSurOffres(remplirModeleCs(p.sujetModele, p.variables)).avant.replace(/\s+/g, " ").trim();
  const corpsEditable = remplirModeleCs(p.corpsModele, p.variables);
  return {
    objet,
    corpsEditable,
    corpsTexte: texteVersTexteMailCs(corpsEditable, p.tableau?.texte ?? null),
    corpsHtml: texteVersHtmlMailCs(corpsEditable, p.tableau?.html ?? null),
  };
}

// --- Destinataires ------------------------------------------------------------------------

const DOMAINE_CABINET = "@real31.fr";

function uniques(emails: readonly (string | undefined | null)[]): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const brut of emails) {
    const e = (brut ?? "").trim();
    if (!e) continue;
    const cle = e.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push(e);
  }
  return out;
}

/**
 * À = le conseil syndical SANS les adresses du cabinet (le mail part aux copropriétaires ;
 * un gestionnaire inscrit dans la liste CS ne doit pas s'y retrouver), dédoublonné.
 * Cc = la copie du binôme (l'autre membre que l'auteur, cf. domain/copie-binome, 28/10/2026),
 * sans celles déjà en À.
 */
export function destinatairesMailCs(p: { conseil: readonly string[]; copie?: readonly (string | null | undefined)[] }): { a: string[]; cc: string[] } {
  const a = uniques(p.conseil).filter((e) => !e.toLowerCase().endsWith(DOMAINE_CABINET));
  const dejaEnA = new Set(a.map((e) => e.toLowerCase()));
  const cc = uniques(p.copie ?? []).filter((e) => !dejaEnA.has(e.toLowerCase()));
  return { a, cc };
}
