// PARSEUR DETERMINISTE du RGD (Releve General de Depenses) - PUR, zero reseau, testable
// avec des items synthetiques. Le RGD est le SEUL document du sortant qui porte la TVA, la
// part deductible et la part recuperable de chaque depense (domain/rgd.ts) : c'est lui qui
// remplit les colonnes TVA / Deductible / Recuperable d'entries.xlsx et qui alimente les
// auto-checks compta n.8 et n.9.
//
// DEUX formats reconnus par leurs en-tetes imprimes (jamais de position en dur) :
//
//   - MATERA (valide sur S0303 par le script Python parse_rgd2.py, et sur le RGD reel
//     S0304) : colonnes "Montant total | TVA incluse | Recuperable | Deductible" calees a
//     droite, dates en toutes lettres ("25 fevrier 2025"), comptes "602001 - Libelle",
//     sections de cle en titre ("Charges generales", "700 - DEPENSES CHAUFFAGE"),
//     totaux "Total <code> - <libelle>" par compte et "Total general" en filet. Le FAUX
//     GRAS se manifeste en items DUPLIQUES (pdfjs) ou en caracteres doubles ("GGrraanndd",
//     pdfplumber) : dedoublonnage sur les TOKENS ALPHABETIQUES UNIQUEMENT - jamais les
//     chiffres, sinon "11 917,04" devient "1 917,04" (piege mesure deux fois, S0303/S0304).
//
//   - FONCIA (S0304, ancien syndic du sortant) : colonnes "A REPARTIR | DONT TVA | CHARGES
//     RECUPERABLES" calees a droite, postes titres "CONTRAT D'ENTRETIEN. (001.100)" dont le
//     marqueur (cle.poste) porte la CLE DE REPARTITION, compte "6140.000000000" sur sa
//     propre ligne, puis les depenses datees. Le titre d'un poste peut se REPLIER : montants
//     sur la ligne-titre, marqueur "(001.554)" seul sur la suivante. La page de SYNTHESE
//     (avant le premier poste) est ecartee. Chaque poste et chaque cle imprime son total :
//     le parseur les reconcilie (filet).
//
// REGLE ABSOLUE (commune) : toute ligne portant un montant et non reconnue va au JOURNAL
// D'ANOMALIES - il doit finir a ZERO, jamais un ecart silencieux.

import { parseNombreFr } from "@/lib/reprise/adapters/shared/parseur-grand-livre";
import type { LigneRgd } from "@/lib/reprise/domain/rgd";
import type { ItemTexte, PageTexte } from "@/lib/reprise/adapters/shared/pdf-texte";

/** Sous ce montant (EUR), une valeur est consideree nulle (bruit d'arrondi). */
const EPS = 0.005;

/** Montant euro complet, symbole attache ("1 544,02 €", "-7,87 €"). */
const RE_MONTANT_EURO = /^-?\d{1,3}(?:[\u00a0\u202f\u2009 ]\d{3})*,\d\d\s*€$/;

/** Fragment numerique d'un montant eclate (groupe de milliers en token separe). */
const RE_FRAGMENT = /^-?\d{1,3}$/;

/** Fin de montant eclate ("811,63" quand "1" est un token separe, € encore a venir). */
const RE_FIN_MONTANT = /^\d{3},\d\d$/;

/** Ligne d'anomalie : portait un montant mais n'a pas ete reconnue.
 *  ATTENTION PII : `texte` peut porter un nom -> diagnostic interne, jamais dans une note. */
export interface AnomalieRgd {
  page: number;
  texte: string;
}

/** Un controle imprime reconcilie par le parseur (total de poste / compte / cle / general). */
export interface ControleRgd {
  /** Niveau du total imprime. */
  niveau: "poste" | "compte" | "cle" | "general";
  /** Code ou libelle PII-free du total (numero de poste, de compte, de cle). */
  code: string;
  /** Total TTC imprime par la source. */
  ttcImprime: number;
  /** Somme TTC des lignes extraites pour ce perimetre. */
  ttcCalcule: number;
  /** Ecart signe (0 attendu). */
  ecart: number;
}

/** Sortie commune des deux parseurs RGD. */
export interface ResultatParsageRgd {
  lignes: LigneRgd[];
  /** Controles imprimes reconcilies (l'equivalent RGD du "Total Compte" du grand livre). */
  controles: ControleRgd[];
  notes: string[];
  /** Journal des lignes a montant non reconnues : doit finir a ZERO. */
  anomalies: AnomalieRgd[];
}

/** Minuscule + sans accents : matching robuste des en-tetes et mots-cles. */
function plier(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Date JJ/MM/AAAA -> ISO. Renvoie null si la chaine n'est pas une date de cette forme. */
function dateFrVersIso(brut: string): string | null {
  const m = brut.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const MOIS_FR: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

/** Date en toutes lettres ("25 fevrier 2025", "1er juillet 2024") -> ISO, ou null. */
function dateLettresVersIso(brut: string): string | null {
  const m = plier(brut.trim()).match(/^(\d{1,2}|1er)\s+([a-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const jour = m[1] === "1er" ? 1 : Number(m[1]);
  const mois = MOIS_FR[m[2]!];
  if (!mois || jour < 1 || jour > 31) return null;
  return `${m[3]}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

/**
 * Deplie le FAUX GRAS "caracteres doubles" ("GGrraanndd" -> "Grand") d'un token, UNIQUEMENT
 * s'il contient au moins une lettre : la regle du skill est "tokens alphabetiques uniquement,
 * jamais les chiffres" - appliquee a un nombre, elle transformerait "11 917,04" en
 * "1 917,04" (piege mesure sur S0303 ET S0304). Sert au matching des titres/en-tetes, JAMAIS
 * a l'extraction des montants.
 */
export function deplierFauxGras(token: string): string {
  if (!/[a-zA-ZÀ-ÿ]/.test(token)) return token; // token sans lettre : intouchable
  if (token.length < 2 || token.length % 2 !== 0) return token;
  for (let i = 0; i < token.length; i += 2) {
    if (token[i] !== token[i + 1]) return token;
  }
  let sortie = "";
  for (let i = 0; i < token.length; i += 2) sortie += token[i];
  return sortie;
}

/**
 * Dedoublonne les items DUPLIQUES d'une ligne (faux gras rendu par pdfjs : le meme texte
 * imprime deux fois au meme endroit). Deux items de meme texte a moins de 2 unites l'un de
 * l'autre sont un seul glyphe : on n'en garde qu'un. Sans risque pour les montants (un vrai
 * montant repete est imprime a une position DIFFERENTE).
 */
export function dedupliquerItems(items: ItemTexte[]): ItemTexte[] {
  const gardes: ItemTexte[] = [];
  for (const it of items) {
    const doublon = gardes.some((g) => g.chaine === it.chaine && Math.abs(g.x - it.x) <= 2);
    if (!doublon) gardes.push(it);
  }
  return gardes;
}

/** Un montant euro positionne : valeur signee + x1 de son dernier token (colonne). */
interface MontantEuro {
  x1: number;
  valeur: number;
}

/**
 * Extrait les montants EURO d'une ligne : soit un item complet "1 544,02 €", soit la forme
 * eclatee du rendu pdfplumber ("1" + "811,63" + "€") a recoller. Rend [(x1, valeur signee)].
 */
export function extraireMontantsEuro(items: ItemTexte[]): MontantEuro[] {
  const out: MontantEuro[] = [];
  const tries = [...items].sort((a, b) => a.x - b.x);
  let buf: ItemTexte[] = [];
  for (const it of tries) {
    const t = it.chaine.trim();
    if (RE_MONTANT_EURO.test(t)) {
      const v = parseNombreFr(t.replace(/€/g, ""));
      if (v !== null) out.push({ x1: it.x + it.largeur, valeur: v });
      buf = [];
      continue;
    }
    if (t === "€") {
      // Fin d'un montant eclate : le buffer doit former un nombre complet.
      const s = buf.map((b) => b.chaine.trim()).join(" ");
      if (/^-?\d{1,3}(?:[\u00a0\u202f\u2009 ]\d{3})*,\d\d$/.test(s)) {
        const v = parseNombreFr(s);
        if (v !== null) out.push({ x1: it.x + it.largeur, valeur: v });
      }
      buf = [];
      continue;
    }
    if (RE_FRAGMENT.test(t) || RE_FIN_MONTANT.test(t) || /^-?\d{1,3},\d\d$/.test(t)) {
      if (buf.length > 0 && it.x - (buf[buf.length - 1]!.x + buf[buf.length - 1]!.largeur) > 6) buf = [];
      buf.push(it);
    } else {
      buf = [];
    }
  }
  return out;
}

/** Rattache chaque montant a l'ancre x1 la plus proche. Rend la valeur par nom d'ancre. */
function repartirParAncres(
  montants: MontantEuro[],
  ancres: { nom: string; x1: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of montants) {
    let meilleure = ancres[0]!;
    let dist = Math.abs(m.x1 - meilleure.x1);
    for (const a of ancres) {
      const d = Math.abs(m.x1 - a.x1);
      if (d < dist) {
        dist = d;
        meilleure = a;
      }
    }
    out[meilleure.nom] = arrondi((out[meilleure.nom] ?? 0) + m.valeur);
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// FORMAT FONCIA
// ---------------------------------------------------------------------------------------

/** Marqueur de poste Foncia "(001.100)" : le groupe 1 est LA CLE DE REPARTITION. */
const RE_MARQUEUR_POSTE = /\((\d{3})\.(\d+)\)/;

/** Compte Foncia sur sa propre ligne : "6140.000000000". */
const RE_COMPTE_FONCIA = /^(\d{3,7})\.(\d+)$/;

/** Date Foncia en tete de ligne de depense : JJ/MM/AAAA. */
const RE_DATE_FONCIA = /^\d{2}\/\d{2}\/\d{4}$/;

interface AncresRgd {
  repartirX1: number;
  tvaX1: number;
  recuperableX1: number;
  deductibleX1?: number;
}

/** Ancres Foncia depuis la ligne d'en-tetes "A REPARTIR | DONT TVA | CHARGES RECUPERABLES". */
function detecterAncresFoncia(page: PageTexte): AncresRgd | null {
  for (const ligne of page.lignes) {
    let repartir: number | null = null;
    let tva: number | null = null;
    let recuperable: number | null = null;
    for (const it of ligne.items) {
      const mot = plier(it.chaine.trim());
      const x1 = it.x + it.largeur;
      if (mot.includes("repartir")) repartir = x1;
      else if (mot === "tva") tva = x1;
      else if (mot.includes("recuperable")) recuperable = x1;
    }
    if (repartir !== null && tva !== null && recuperable !== null) {
      return { repartirX1: repartir, tvaX1: tva, recuperableX1: recuperable };
    }
  }
  return null;
}

/** Le jeu de pages est-il un RGD Foncia (marqueurs de poste + en-tetes A REPARTIR) ? */
function estFormatFoncia(pages: PageTexte[]): boolean {
  const aAncres = pages.some((p) => detecterAncresFoncia(p) !== null);
  if (!aAncres) return false;
  return pages.some((p) =>
    p.lignes.some((l) => RE_MARQUEUR_POSTE.test(l.items.map((it) => it.chaine).join(" "))),
  );
}

interface PosteFoncia {
  cle: string;
  poste: string;
  totaux: Record<string, number>;
  /** Somme TTC des depenses lues pour ce poste (reconciliation). */
  ttcCalcule: number;
}

/** Parseur du RGD FONCIA. Exporte pour les tests ; les appelants passent par parserRgd. */
export function parserRgdFoncia(pages: PageTexte[]): ResultatParsageRgd {
  const lignes: LigneRgd[] = [];
  const controles: ControleRgd[] = [];
  const anomalies: AnomalieRgd[] = [];
  const notes: string[] = [];

  let ancres: AncresRgd | null = null;
  let poste: PosteFoncia | null = null;
  let compte = "";
  let cleCourante = ""; // la cle de la section en cours (pour le total de cle imprime)
  const totauxPostesParCle = new Map<string, number>(); // somme des totaux de POSTES par cle
  let premierPosteVu = false;
  let nbSynthese = 0;
  let nbPostes = 0;

  // Titre de poste replie : montants sur la ligne-titre, marqueur "(cle.poste)" seul sur la
  // ligne suivante. On garde la ligne en attente jusqu'a la ligne suivante.
  let titreEnAttente: { texte: string; totaux: Record<string, number>; page: number } | null = null;

  const cloreposte = () => {
    if (!poste) return;
    const imprime = poste.totaux["repartir"];
    if (imprime !== undefined) {
      controles.push({
        niveau: "poste",
        code: `${poste.cle}.${poste.poste}`,
        ttcImprime: imprime,
        ttcCalcule: arrondi(poste.ttcCalcule),
        ecart: arrondi(poste.ttcCalcule - imprime),
      });
      totauxPostesParCle.set(poste.cle, arrondi((totauxPostesParCle.get(poste.cle) ?? 0) + imprime));
    }
    poste = null;
    compte = "";
  };

  for (let pno = 0; pno < pages.length; pno++) {
    const page = pages[pno]!;
    const detectees = detecterAncresFoncia(page);
    if (detectees) ancres = detectees;

    for (const ligne of page.lignes) {
      const items = dedupliquerItems(ligne.items);
      const montants = extraireMontantsEuro(items);
      const itemsTexte = items.filter((it) => !RE_MONTANT_EURO.test(it.chaine.trim()) && it.chaine.trim() !== "€");
      const texte = itemsTexte.map((it) => it.chaine).join(" ").replace(/\s+/g, " ").trim();
      const texteFold = plier(texte);
      const aMontants = montants.length > 0;
      const nomsAncres = ancres
        ? [
            { nom: "repartir", x1: ancres.repartirX1 },
            { nom: "tva", x1: ancres.tvaX1 },
            { nom: "recuperable", x1: ancres.recuperableX1 },
          ]
        : [];
      const parColonne = ancres && aMontants ? repartirParAncres(montants, nomsAncres) : {};

      // La ligne d'en-tetes de colonnes elle-meme.
      if (texteFold.includes("repartir") && texteFold.includes("tva")) continue;

      // --- Marqueur de poste : ouvre un poste (la cle de repartition est dans le marqueur).
      const marqueur = texte.match(RE_MARQUEUR_POSTE);
      if (marqueur) {
        cloreposte();
        // Titre replie : les totaux du poste etaient sur la ligne-titre precedente.
        const totaux = aMontants ? parColonne : (titreEnAttente?.totaux ?? {});
        titreEnAttente = null;
        poste = { cle: marqueur[1]!, poste: marqueur[2]!, totaux, ttcCalcule: 0 };
        cleCourante = marqueur[1]!;
        premierPosteVu = true;
        nbPostes++;
        continue;
      }

      // --- Compte du poste sur sa propre ligne.
      if (RE_COMPTE_FONCIA.test(texte)) {
        compte = texte;
        titreEnAttente = null;
        continue;
      }

      // Un titre etait en attente et la ligne suivante n'est PAS son marqueur : anomalie.
      if (titreEnAttente) {
        anomalies.push({ page: titreEnAttente.page, texte: titreEnAttente.texte.slice(0, 110) });
        titreEnAttente = null;
      }

      if (!aMontants) continue; // decor, replis de libelle, pieds de page

      // --- Total de cle imprime ("Total DEPENSES GENERALES ...").
      if (texteFold.startsWith("total")) {
        cloreposte();
        const imprime = parColonne["repartir"];
        if (imprime !== undefined && cleCourante) {
          const calcule = totauxPostesParCle.get(cleCourante) ?? 0;
          controles.push({
            niveau: "cle",
            code: cleCourante,
            ttcImprime: imprime,
            ttcCalcule: calcule,
            ecart: arrondi(calcule - imprime),
          });
        }
        continue;
      }

      // --- Page de synthese (avant le premier poste) : recapitulatif, jamais des depenses.
      if (!premierPosteVu) {
        nbSynthese++;
        continue;
      }

      // --- Ligne de depense : commence par une date JJ/MM/AAAA.
      const premierToken = (itemsTexte[0]?.chaine ?? "").trim();
      const dateIso = RE_DATE_FONCIA.test(premierToken) ? dateFrVersIso(premierToken) : null;
      if (dateIso && poste && compte) {
        const ttc = parColonne["repartir"] ?? 0;
        const libelle = itemsTexte
          .slice(1)
          .map((it) => it.chaine)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        const ligneRgd: LigneRgd = {
          date: dateIso,
          compte,
          ttc,
          cle: (poste as PosteFoncia).cle,
        };
        if (libelle) ligneRgd.libelle = libelle.slice(0, 180);
        if (parColonne["tva"] !== undefined) ligneRgd.tva = parColonne["tva"];
        if (parColonne["recuperable"] !== undefined) ligneRgd.recuperable = parColonne["recuperable"];
        lignes.push(ligneRgd);
        (poste as PosteFoncia).ttcCalcule = arrondi((poste as PosteFoncia).ttcCalcule + ttc);
        continue;
      }

      // --- Ligne a montants sans date ni marqueur : peut etre un TITRE REPLIE (le marqueur
      // arrive sur la ligne suivante). On la met en attente ; elle deviendra une anomalie si
      // le marqueur ne suit pas.
      titreEnAttente = { texte, totaux: parColonne, page: pno + 1 };
    }
  }
  cloreposte();
  if (titreEnAttente !== null) {
    const attente = titreEnAttente as { texte: string; totaux: Record<string, number>; page: number };
    anomalies.push({ page: attente.page, texte: attente.texte.slice(0, 110) });
  }

  const enEcart = controles.filter((c) => Math.abs(c.ecart) >= EPS).length;
  notes.push(
    `Parseur RGD Foncia : ${pages.length} page(s), ${lignes.length} depense(s), ${nbPostes} poste(s), ${controles.length} total(aux) imprime(s) reconcilie(s) dont ${enEcart} en ecart.`,
  );
  if (nbSynthese) notes.push(`Parseur RGD Foncia : ${nbSynthese} ligne(s) de synthese ecartee(s).`);
  if (anomalies.length) {
    notes.push(
      `Parseur RGD Foncia : ${anomalies.length} ligne(s) A MONTANT NON RECONNUES (journal d'anomalies) - ce compteur doit etre a ZERO.`,
    );
  }
  return { lignes, controles, notes, anomalies };
}

// ---------------------------------------------------------------------------------------
// FORMAT MATERA
// ---------------------------------------------------------------------------------------

/** En-tete de compte Matera "602001 - Libelle" (apres depliage du faux gras). */
const RE_COMPTE_MATERA = /^(\d{3,7})\s*-+\s*(.+)$/;

/** Ancres Matera + reperes de zone depuis "Date | Libelle | Montant total | TVA incluse...". */
interface CalageMatera extends AncresRgd {
  /** x0 max du bord GAUCHE d'une ligne de structure (date, compte, section, total). */
  margeGaucheMax: number;
}

function detecterCalageMatera(page: PageTexte): CalageMatera | null {
  for (const ligne of page.lignes) {
    const texteFold = plier(dedupliquerItems(ligne.items).map((it) => it.chaine).join(" "));
    if (!(texteFold.includes("montant total") && texteFold.includes("tva"))) continue;
    let total: number | null = null;
    let tva: number | null = null;
    let recuperable: number | null = null;
    let deductible: number | null = null;
    let dateX0: number | null = null;
    for (const it of ligne.items) {
      const mot = plier(it.chaine.trim());
      const x1 = it.x + it.largeur;
      if (mot.includes("montant")) total = x1;
      else if (mot.includes("tva")) tva = x1;
      else if (mot.includes("recuperable")) recuperable = x1;
      else if (mot.includes("deductible")) deductible = x1;
      else if (mot === "date") dateX0 = it.x;
    }
    if (total !== null && tva !== null && recuperable !== null && deductible !== null) {
      return {
        repartirX1: total,
        tvaX1: tva,
        recuperableX1: recuperable,
        deductibleX1: deductible,
        margeGaucheMax: (dateX0 ?? 33) + 40,
      };
    }
  }
  return null;
}

/** Le jeu de pages est-il un RGD Matera (en-tetes Montant total / TVA incluse...) ? */
function estFormatMatera(pages: PageTexte[]): boolean {
  return pages.some((p) => detecterCalageMatera(p) !== null);
}

/**
 * Cle de repartition d'un titre de section Matera. Les titres portent soit un code explicite
 * ("700 - DEPENSES CHAUFFAGE" -> "700"), soit un nom en clair : "Charges generales" est la
 * cle generale ("001", convention cabinet) ; tout autre nom est conserve TEL QUEL - c'est la
 * cle DU SORTANT, le mapping vers la nomenclature cabinet est un geste humain en aval.
 */
function cleDeSection(titre: string): string {
  const m = titre.match(/^(\d{3})\s*-\s*(.+)$/);
  if (m && m[2] === m[2]!.toUpperCase()) return m[1]!;
  // "charges generales" EXACTEMENT : "Charges Garages ou Parkings" (section reelle S0304)
  // est une autre cle - un prefixe trop court la fondrait dans la cle generale.
  if (plier(titre).startsWith("charges generales")) return "001";
  return titre.trim();
}

/** Parseur du RGD MATERA. Exporte pour les tests ; les appelants passent par parserRgd. */
export function parserRgdMatera(pages: PageTexte[]): ResultatParsageRgd {
  const lignes: LigneRgd[] = [];
  const controles: ControleRgd[] = [];
  const anomalies: AnomalieRgd[] = [];
  const notes: string[] = [];

  let calage: CalageMatera | null = null;
  let compte = "";
  let cle = "001";
  let nbSections = 0;
  const ttcParCompte = new Map<string, number>();
  const ttcParCle = new Map<string, number>();
  let ttcGlobal = 0;
  // Libelle de total replie ("Total 614014 - ... - 790 - DEPENSES ENTRETIEN" sur sa ligne,
  // montants seuls sur la suivante, "COMPTEUR" en dessous - cas reel S0304) : on retient le
  // libelle jusqu'a la ligne de montants qui le suit.
  let totalEnAttente: string | null = null;

  /** Route un total imprime (compte / section / general) vers son controle. */
  const traiterTotal = (texteTotal: string, imprime: number): void => {
    if (plier(texteTotal).startsWith("total general")) {
      controles.push({
        niveau: "general",
        code: "general",
        ttcImprime: imprime,
        ttcCalcule: arrondi(ttcGlobal),
        ecart: arrondi(ttcGlobal - imprime),
      });
      return;
    }
    const mTot = texteTotal.match(/^Total\s+(\d{3,7})\s*-\s*(.+)$/i);
    const libelleTot = mTot ? mTot[2]!.trim() : "";
    const estSection =
      !mTot || (mTot[1]!.length === 3 && libelleTot === libelleTot.toUpperCase() && /[A-Z]/.test(libelleTot));
    if (!estSection && mTot) {
      const code = mTot[1]!;
      controles.push({
        niveau: "compte",
        code,
        ttcImprime: imprime,
        ttcCalcule: ttcParCompte.get(code) ?? 0,
        ecart: arrondi((ttcParCompte.get(code) ?? 0) - imprime),
      });
      return;
    }
    // Total de section -> controle par CLE (seulement si la section a porte des lignes).
    const cleTot = cleDeSection(texteTotal.replace(/^Total\s+/i, "").trim());
    const calcule = ttcParCle.get(cleTot);
    if (calcule !== undefined) {
      controles.push({
        niveau: "cle",
        code: cleTot,
        ttcImprime: imprime,
        ttcCalcule: calcule,
        ecart: arrondi(calcule - imprime),
      });
    }
  };

  for (let pno = 0; pno < pages.length; pno++) {
    const page = pages[pno]!;
    const detecte = detecterCalageMatera(page);
    if (detecte) calage = detecte;
    if (!calage) continue;

    for (const ligne of page.lignes) {
      const items = dedupliquerItems(ligne.items);
      const montants = extraireMontantsEuro(items);
      const itemsTexte = items.filter((it) => !RE_MONTANT_EURO.test(it.chaine.trim()) && it.chaine.trim() !== "€");
      // Depliage du faux gras "caracteres doubles" pour le MATCHING uniquement (les montants
      // sont extraits des items bruts, jamais deplies).
      const texte = itemsTexte
        .map((it) => it.chaine.trim().split(/\s+/).map(deplierFauxGras).join(" "))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const texteFold = plier(texte);
      const ancres: { nom: string; x1: number }[] = [
        { nom: "total", x1: calage.repartirX1 },
        { nom: "tva", x1: calage.tvaX1 },
        { nom: "recuperable", x1: calage.recuperableX1 },
        { nom: "deductible", x1: calage.deductibleX1! },
      ];
      const parColonne = montants.length > 0 ? repartirParAncres(montants, ancres) : {};

      if (texteFold.includes("montant total") && texteFold.includes("tva")) continue; // en-tetes
      if (/^page\s+\d+\s+sur\s+\d+$/.test(texteFold)) continue;

      const premier = itemsTexte[0];
      const gauche = premier !== undefined && premier.x < calage.margeGaucheMax;

      // --- Montants SEULS apres un libelle de total replie : ce sont les montants du total.
      if (totalEnAttente !== null && itemsTexte.length === 0 && parColonne["total"] !== undefined) {
        traiterTotal(totalEnAttente, parColonne["total"]);
        totalEnAttente = null;
        continue;
      }

      // --- Totaux imprimes : "Total general", "Total <code> - <libelle>" (compte) ou total
      // de SECTION ("Total 700 - DEPENSES CHAUFFAGE", "Total Escalier E") - la meme regle
      // que les titres separe compte et section : code 3 chiffres + libelle en capitales.
      if (texteFold.startsWith("total")) {
        const imprime = parColonne["total"];
        if (imprime === undefined) {
          // Libelle replie : les montants arrivent seuls sur la ligne suivante.
          totalEnAttente = texte;
          continue;
        }
        traiterTotal(texte, imprime);
        totalEnAttente = null;
        continue;
      }

      // --- Ligne de depense : commence par une date (en toutes lettres ou JJ/MM/AAAA).
      const mDate = gauche ? texteFold.match(/^(\d{1,2}|1er)\s+([a-z]+)\s+(\d{4})\b/) : null;
      const dateTexte = mDate ? `${mDate[1]} ${mDate[2]} ${mDate[3]}` : "";
      const dateIso = mDate
        ? dateLettresVersIso(dateTexte)
        : gauche && premier && RE_DATE_FONCIA.test(premier.chaine.trim())
          ? dateFrVersIso(premier.chaine.trim())
          : null;
      if (dateIso && montants.length > 0) {
        if (!compte) {
          anomalies.push({ page: pno + 1, texte: texte.slice(0, 110) });
          continue;
        }
        const ttc = parColonne["total"] ?? 0;
        const libelle = mDate ? texte.slice(dateTexte.length).trim() : texte.replace(premier?.chaine.trim() ?? "", "").trim();
        const ligneRgd: LigneRgd = { date: dateIso, compte, ttc, cle };
        if (libelle) ligneRgd.libelle = libelle.slice(0, 180);
        if (parColonne["tva"] !== undefined) ligneRgd.tva = parColonne["tva"];
        if (parColonne["recuperable"] !== undefined) ligneRgd.recuperable = parColonne["recuperable"];
        if (parColonne["deductible"] !== undefined) ligneRgd.deductible = parColonne["deductible"];
        lignes.push(ligneRgd);
        ttcParCompte.set(compte, arrondi((ttcParCompte.get(compte) ?? 0) + ttc));
        ttcParCle.set(cle, arrondi((ttcParCle.get(cle) ?? 0) + ttc));
        ttcGlobal = arrondi(ttcGlobal + ttc);
        continue;
      }

      // --- En-tete de compte "602001 - Libelle" OU titre de section de cle.
      if (gauche && montants.length === 0) {
        const mCompte = texte.match(RE_COMPTE_MATERA);
        if (mCompte) {
          const code = mCompte[1]!;
          const libelleCompte = mCompte[2]!.trim();
          // Garde du skill : un millesime n'est jamais un numero de compte (libelle SEPA
          // replie "2026 - Creditor Name" imitant un en-tete).
          if (/^(19|20)\d\d$/.test(code)) continue;
          // Section a code ("700 - DEPENSES CHAUFFAGE", libelle tout en capitales) vs compte
          // ("611 - Nettoyage des locaux", casse mixte).
          if (code.length === 3 && libelleCompte === libelleCompte.toUpperCase() && /[A-Z]/.test(libelleCompte)) {
            cle = cleDeSection(texte);
            nbSections++;
          } else {
            compte = code;
          }
          continue;
        }
        // Titre de section sans code ("Charges generales", "Escalier E").
        if (!dateIso && texte && !/\d{2}\/\d{2}/.test(texte)) {
          cle = cleDeSection(texte);
          nbSections++;
          continue;
        }
      }

      // --- Rien reconnu mais des montants : JOURNAL D'ANOMALIES.
      if (montants.length > 0) {
        anomalies.push({ page: pno + 1, texte: texte.slice(0, 110) });
      }
    }
  }

  const enEcart = controles.filter((c) => Math.abs(c.ecart) >= EPS).length;
  notes.push(
    `Parseur RGD Matera : ${pages.length} page(s), ${lignes.length} depense(s), ${nbSections} section(s) de cle, ${controles.length} total(aux) imprime(s) reconcilie(s) dont ${enEcart} en ecart.`,
  );
  if (anomalies.length) {
    notes.push(
      `Parseur RGD Matera : ${anomalies.length} ligne(s) A MONTANT NON RECONNUES (journal d'anomalies) - ce compteur doit etre a ZERO.`,
    );
  }
  return { lignes, controles, notes, anomalies };
}

// ---------------------------------------------------------------------------------------
// POINT D'ENTREE
// ---------------------------------------------------------------------------------------

/** Format RGD detecte par les en-tetes imprimes (null = aucun format connu). */
export function detecterFormatRgd(pages: PageTexte[]): "foncia" | "matera" | null {
  if (estFormatMatera(pages)) return "matera";
  if (estFormatFoncia(pages)) return "foncia";
  return null;
}

/**
 * Parse un RGD en choisissant le format d'apres les en-tetes imprimes. Leve si aucun format
 * n'est reconnu : mieux vaut une erreur explicite qu'un RGD silencieusement vide (les checks
 * 8/9 resteraient "non executes" sans que personne ne sache pourquoi).
 */
export function parserRgd(pages: PageTexte[]): ResultatParsageRgd {
  const format = detecterFormatRgd(pages);
  if (format === "matera") return parserRgdMatera(pages);
  if (format === "foncia") return parserRgdFoncia(pages);
  throw new Error(
    "Format de RGD non reconnu : ni les en-tetes Matera (Montant total / TVA incluse), ni les en-tetes Foncia (A REPARTIR / DONT TVA) n'ont ete trouves dans la couche texte.",
  );
}
