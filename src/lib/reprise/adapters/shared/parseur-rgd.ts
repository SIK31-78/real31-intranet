// PARSEUR DETERMINISTE du RGD (Releve General des Depenses) a partir de la couche texte
// positionnee - bloc B de la reprise comptable. PUR, zero reseau, testable avec des items
// synthetiques. Meme philosophie que le parseur grand livre : AGNOSTIQUE au syndic, aucune
// position ni aucun compte codes en dur, les colonnes sont reconnues par leurs EN-TETES
// IMPRIMES ("Montant total", "TVA incluse", "Recuperable", "Deductible" - mesures sur le
// RGD Matera S0303) et les montants rattaches a l'ancre x la plus proche. L'ancrage par x
// est OBLIGATOIRE ici : certaines lignes omettent la cellule TVA, un comptage de colonnes
// decalerait tout.
//
// Structure d'un RGD (mesuree) :
//   [en-tete de colonnes]                        Date | Libelle | Montant total | TVA | ...
//   SECTION = la cle de repartition              "Charges generales" (titre en faux gras)
//     COMPTE                                     "602001 - Electricite - Charges generales"
//       lignes de depense                        date | libelle | montants...
//       "Total 602001 - ..."                     total imprime du compte
//     "Total Charges generales"                  total imprime de la section
//   "Total general"                              total imprime du document
//
// L'echec est VISIBLE : sans en-tete de colonnes reconnu, on rend zero depense ET une note
// qui le dit (page, motif). Un resultat vide silencieux est interdit (lecon du GL S0303).

import { parseNombreFr } from "@/lib/reprise/adapters/shared/parseur-grand-livre";
import type { ItemTexte, PageTexte } from "@/lib/reprise/adapters/shared/pdf-texte";
import {
  dedoublonnerItems,
  extraireDate,
  plier,
  tokensFold,
} from "@/lib/reprise/adapters/shared/texte-positions";
import type {
  DepenseRgd,
  ResultatParsageRgd,
  TotalImprimeRgd,
} from "@/lib/reprise/domain/rgd";

/** En-tete de compte "NNN - Libelle" (meme motif que le grand livre Matera). */
const RE_ENTETE_COMPTE = /^([1-7]\d{2,}(?:\.\d+)?)\s*-\s*(.+)$/;
/** Total d'un compte : "Total 602001 - ..." (le numero est DANS la ligne, on le lit la). */
const RE_TOTAL_COMPTE = /^total\s+([1-7]\d{2,}(?:\.\d+)?)\b/;
/** Pied de page "Page 2 sur 2" : ses nombres tombent dans la zone des montants -> a ecarter. */
const RE_PIED_DE_PAGE = /^page\s+\d+\s+sur\s+\d+$/;

/** Ancres x des 4 colonnes de montant du RGD. */
interface ColonnesRgd {
  montantX: number;
  tvaX: number | null;
  recuperableX: number | null;
  deductibleX: number | null;
  /** Frontiere gauche de la zone des montants. */
  montantMinX: number;
}

/**
 * Detecte les colonnes par la ligne d'en-tete ("Montant total" + au moins une des colonnes
 * TVA / Recuperable / Deductible). Tokens EXACTS (lecon "Creditor Name" du grand livre) :
 * un libelle contenant "montant" ne peut pas voler une ancre, il faudrait qu'il soit sur la
 * ligne d'en-tete elle-meme.
 */
export function detecterColonnesRgd(page: PageTexte): ColonnesRgd | null {
  for (const ligne of page.lignes) {
    const items = dedoublonnerItems(ligne.items).items;
    const tokens = new Set(tokensFold(items.map((i) => i.chaine).join(" ")));
    if (!tokens.has("montant") || !(tokens.has("tva") || tokens.has("recuperable") || tokens.has("deductible"))) {
      continue;
    }
    let montantX: number | null = null;
    let tvaX: number | null = null;
    let recuperableX: number | null = null;
    let deductibleX: number | null = null;
    for (const it of items) {
      const t = new Set(tokensFold(it.chaine));
      const centre = it.x + it.largeur / 2;
      if (t.has("montant")) montantX = centre;
      else if (t.has("tva")) tvaX = centre;
      else if (t.has("recuperable")) recuperableX = centre;
      else if (t.has("deductible")) deductibleX = centre;
    }
    if (montantX === null) continue;
    const ancres = [montantX, tvaX, recuperableX, deductibleX].filter((x): x is number => x !== null);
    return { montantX, tvaX, recuperableX, deductibleX, montantMinX: Math.min(...ancres) - 20 };
  }
  return null;
}

/** Rattache chaque item numerique de la zone montants a l'ancre la plus proche. */
function classerMontantsRgd(
  items: ItemTexte[],
  col: ColonnesRgd,
): { montant?: number; tva?: number; recuperable?: number; deductible?: number } {
  const ancres: { x: number; role: "montant" | "tva" | "recuperable" | "deductible" }[] = [
    { x: col.montantX, role: "montant" },
    ...(col.tvaX !== null ? [{ x: col.tvaX, role: "tva" as const }] : []),
    ...(col.recuperableX !== null ? [{ x: col.recuperableX, role: "recuperable" as const }] : []),
    ...(col.deductibleX !== null ? [{ x: col.deductibleX, role: "deductible" as const }] : []),
  ];
  const sortie: { montant?: number; tva?: number; recuperable?: number; deductible?: number } = {};
  for (const it of items) {
    const centre = it.x + it.largeur / 2;
    if (centre < col.montantMinX) continue;
    const n = parseNombreFr(it.chaine);
    if (n === null) continue;
    let role = ancres[0]!.role;
    let dist = Math.abs(centre - ancres[0]!.x);
    for (const a of ancres) {
      const d = Math.abs(centre - a.x);
      if (d < dist) {
        dist = d;
        role = a.role;
      }
    }
    // Montant SIGNE conserve (un avoir est negatif, mesure "-2,75" sur S0303).
    sortie[role] = (sortie[role] ?? 0) + n;
  }
  return sortie;
}

/**
 * Parse le RGD complet. Suit la SECTION courante (= cle de repartition) et le COMPTE
 * courant ; capture les totaux imprimes a trois niveaux (compte, section, general).
 * Aucun nom ne fuit dans les notes (compteurs seulement).
 */
export function parserRgd(pages: PageTexte[]): ResultatParsageRgd {
  const depenses: DepenseRgd[] = [];
  const totaux: TotalImprimeRgd[] = [];
  const notes: string[] = [];

  let col: ColonnesRgd | null = null;
  let cleCourante = "";
  let compteCourant = "";
  let intituleCourant: string | undefined;
  let pagesSansColonnes = 0;
  let doublesRetires = 0;
  let lignesEcartees = 0;

  for (const page of pages) {
    const detecte = detecterColonnesRgd(page);
    if (detecte) col = detecte;
    if (!col) {
      // Ni en-tete sur cette page, ni modele herite d'une precedente.
      pagesSansColonnes++;
      continue;
    }
    const colonnes = col;

    for (const ligne of page.lignes) {
      const dedouble = dedoublonnerItems(ligne.items);
      doublesRetires += dedouble.retires;
      const items = dedouble.items;

      const texteComplet = items.map((i) => i.chaine).join(" ").replace(/\s+/g, " ").trim();
      const foldComplet = plier(texteComplet);
      // Pied de page : ses nombres tombent dans la zone des montants, on l'ecarte AVANT
      // toute classification.
      if (RE_PIED_DE_PAGE.test(foldComplet)) continue;

      const itemsTexte = items.filter((i) => i.x + i.largeur / 2 < colonnes.montantMinX);
      const texte = itemsTexte.map((i) => i.chaine).join(" ").replace(/\s+/g, " ").trim();
      const fold = plier(texte);
      const montants = classerMontantsRgd(items, colonnes);
      const aDesMontants =
        montants.montant !== undefined ||
        montants.tva !== undefined ||
        montants.recuperable !== undefined ||
        montants.deductible !== undefined;

      // Ligne d'en-tete de colonnes (repetee en haut de chaque page) : deja exploitee.
      const tokens = new Set(tokensFold(texteComplet));
      if (tokens.has("montant") && (tokens.has("tva") || tokens.has("recuperable") || tokens.has("deductible")) && !aDesMontants) {
        continue;
      }

      // "Total general" : le filet du document entier.
      if (fold.startsWith("total general")) {
        totaux.push({ portee: "general", montant: montants.montant ?? 0, ...restes(montants) });
        compteCourant = "";
        continue;
      }

      // "Total 602001 - ..." : total du COMPTE (numero lu dans la ligne, pas dans l'etat).
      const totalCompte = fold.match(RE_TOTAL_COMPTE);
      if (totalCompte) {
        totaux.push({ portee: `compte:${totalCompte[1]}`, montant: montants.montant ?? 0, ...restes(montants) });
        compteCourant = "";
        continue;
      }

      // "Total <section>" : total de la SECTION (cle). La section se clot ici.
      if (fold.startsWith("total ") && cleCourante && fold.includes(plier(cleCourante))) {
        totaux.push({ portee: `section:${cleCourante}`, montant: montants.montant ?? 0, ...restes(montants) });
        cleCourante = "";
        compteCourant = "";
        continue;
      }

      // En-tete de COMPTE : "602001 - Electricite - Charges generales".
      const entete = texte.match(RE_ENTETE_COMPTE);
      if (entete && !aDesMontants) {
        compteCourant = entete[1]!;
        intituleCourant = entete[2]!.replace(/\s+/g, " ").trim();
        continue;
      }

      // Ligne de DEPENSE : une date en tete + des montants.
      const date = extraireDate(texte);
      if (date && aDesMontants) {
        if (!compteCourant) {
          // Une depense sans compte courant = structure inattendue : on ecarte, VISIBLEMENT.
          lignesEcartees++;
          continue;
        }
        // Le libelle est le texte APRES la date (la date occupe la 1re colonne).
        const libelle = itemsTexte
          .slice(1)
          .map((i) => i.chaine)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        depenses.push({
          date,
          compte: compteCourant,
          ...(intituleCourant ? { intituleCompte: intituleCourant } : {}),
          cle: cleCourante,
          libelle,
          montant: montants.montant ?? 0,
          ...(montants.tva !== undefined ? { tva: montants.tva } : {}),
          ...(montants.recuperable !== undefined ? { recuperable: montants.recuperable } : {}),
          ...(montants.deductible !== undefined ? { deductible: montants.deductible } : {}),
        });
        continue;
      }

      // Titre de SECTION (cle de repartition) : du texte seul, sans montants, hors de tout
      // motif ci-dessus ("Charges generales", "Tantiemes CHARGES BATIMENT - A"). On ignore
      // les lignes d'entete du document (celles d'avant la 1re section n'ont pas de compte).
      if (texte && !aDesMontants && !date) {
        cleCourante = texte;
        continue;
      }

      // Reste : montants sans date ni motif reconnu (debordement de libelle ?) -> ecarte,
      // la reconciliation par compte revelera toute perte.
      if (aDesMontants) lignesEcartees++;
    }
  }

  notes.push(
    `Parseur RGD (couche texte native) : ${pages.length} page(s), ${depenses.length} depense(s), ${totaux.length} total(aux) imprime(s) capture(s).`,
  );
  if (doublesRetires) notes.push(`Parseur RGD : ${doublesRetires} item(s) dessine(s) en double retire(s) (faux gras).`);
  if (lignesEcartees) notes.push(`Parseur RGD : ${lignesEcartees} ligne(s) a montants ecartee(s) (sans date ou sans compte) - vérifier la reconciliation.`);
  if (pagesSansColonnes) notes.push(`Parseur RGD : ${pagesSansColonnes} page(s) sans en-tete de colonnes exploitable.`);
  if (depenses.length === 0) {
    notes.push(
      "Parseur RGD : AUCUNE depense extraite - format non reconnu (en-tetes de colonnes ou structure de sections introuvables). Ne pas poursuivre sans diagnostic.",
    );
  }

  return { depenses, totaux, notes };
}

/** TVA / recuperable / deductible presents seulement s'ils ont ete lus (exactOptional). */
function restes(m: { tva?: number; recuperable?: number; deductible?: number }): {
  tva?: number;
  recuperable?: number;
  deductible?: number;
} {
  return {
    ...(m.tva !== undefined ? { tva: m.tva } : {}),
    ...(m.recuperable !== undefined ? { recuperable: m.recuperable } : {}),
    ...(m.deductible !== undefined ? { deductible: m.deductible } : {}),
  };
}
