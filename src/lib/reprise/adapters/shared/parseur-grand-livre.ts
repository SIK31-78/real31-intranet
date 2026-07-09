// PARSEUR DETERMINISTE du grand livre (PUR, zero reseau, entierement testable). Applique une
// SpecFormatGrandLivre (produite par l'IA) a des pages OCR en markdown pour reconstituer les
// ecritures SANS jamais demander a l'IA de recopier un montant. C'est le coeur du pipeline
// hybride : l'IA comprend le format, le code transcrit.
//
// Robustesse : lignes vides, cellules fusionnees, separateurs markdown (---), pages sans
// tableau, en-tetes de colonnes -> toleres. Une ligne de donnees inparsable devient une NOTE
// (compteur), jamais un crash. Aucun libelle/nom ne fuit dans les notes (agregats seulement).

import type { ControleCompte } from "@/lib/reprise/domain/ecriture";
import type { SpecFormatGrandLivre } from "@/lib/reprise/adapters/shared/format-grand-livre";

/** Ligne d'ecriture AVANT normalisation (sens deja resolu, montant a rendre positif en aval). */
export interface LigneEcritureBrute {
  date: string;
  compte: string;
  libelle: string;
  sens: "debit" | "credit";
  montant: number;
  piece?: string;
}

/** Sortie du parseur : ecritures brutes + totaux de controle captures + notes agregees. */
export interface ResultatParsage {
  lignes: LigneEcritureBrute[];
  controles: ControleCompte[];
  notes: string[];
}

/** Seuil sous lequel un montant est considere nul/absent (bruit d'arrondi). */
const EPS = 0.005;

/**
 * Convertit un nombre au format francais en float. Gere : espaces (dont insecables), symbole
 * euro, virgule decimale, points de milliers, negatif par signe - ou parentheses, marqueur
 * D/C accole. Renvoie null si la cellule ne contient pas un nombre exploitable.
 */
export function parseNombreFr(brut: string): number | null {
  let s = (brut ?? "").trim();
  if (!s) return null;
  // Retire la decoration markdown d'emphase/code (** gras **, _italique_, `code`) : l'OCR met
  // souvent les TOTAUX en gras (ex. "**688,78**"), ce qui ferait echouer la reconnaissance du
  // nombre et perdrait la capture des totaux de controle. Les montants ne contiennent jamais
  // ces caracteres, donc les retirer est neutre pour les ecritures.
  s = s.replace(/[*_`]/g, "").trim();
  if (!s) return null;
  let negatif = false;
  if (/^\(.*\)$/.test(s)) {
    negatif = true;
    s = s.slice(1, -1);
  }
  // Retire espaces (normal, insecable, fine insecable, fine) et symbole monetaire.
  s = s.replace(/[\s   €]/g, "");
  // Marqueur de sens accole (ex. "100,00C") ou libelle de devise : on le retire ici (le sens
  // est traite a part). On ne garde que chiffres, separateurs et signes.
  s = s.replace(/[A-Za-z]+$/, "");
  if (s.endsWith("-")) {
    negatif = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negatif = true;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.includes(",")) {
    // Virgule = separateur decimal francais -> les points sont des milliers.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    // Plusieurs points sans virgule -> points de milliers.
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negatif ? -n : n;
}

/** Une ligne markdown est-elle une ligne de tableau (contient au moins une barre) ? */
function estLigneTableau(ligne: string): boolean {
  return ligne.includes("|");
}

/** Ligne separateur markdown (|---|:--:|) : que des tirets/deux-points entre les barres. */
function estSeparateur(ligne: string): boolean {
  const cells = decouperCellules(ligne);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c) || /^:?-+:?$/.test(c));
}

/**
 * Decoupe une ligne de tableau en cellules 0-based (gauche -> droite). On retire l'eventuelle
 * cellule vide de bord (barres externes) mais on PRESERVE les cellules internes vides pour ne
 * pas decaler les index de la spec.
 */
function decouperCellules(ligne: string): string[] {
  const parts = ligne.split("|").map((c) => c.trim());
  if (parts.length && parts[0] === "") parts.shift();
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/** Cellule a l'index donne (null-safe). Index null ou hors bornes -> "". */
function cellule(cells: string[], index: number | null): string {
  if (index === null || index < 0 || index >= cells.length) return "";
  return cells[index] ?? "";
}

/** Nettoie une ligne de sa decoration markdown (titres #, emphases *_/**) pour l'en-tete. */
function sansDecorationMarkdown(ligne: string): string {
  return ligne
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*|__|\*|_/g, "")
    .trim();
}

/** Minuscule + sans accents : matching de mots-cles robuste (OCR/IA melangent les accents). */
function plier(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** texte contient-il un des mots-cles (non vides), a la casse et aux accents pres ? */
function contientMotCle(texte: string, motsCles: string[]): boolean {
  const t = plier(texte);
  return motsCles.some((m) => {
    const k = plier(m.trim());
    return k.length > 0 && t.includes(k);
  });
}

/**
 * Applique la spec a l'ensemble des pages OCR. Suit le compte courant (colonne dediee OU motif
 * d'en-tete), transcrit chaque ligne d'ecriture, exclut reports/soldes/totaux et CAPTURE les
 * totaux imprimes par compte comme points de controle.
 */
export function parserGrandLivre(pagesMarkdown: string[], spec: SpecFormatGrandLivre): ResultatParsage {
  const lignes: LigneEcritureBrute[] = [];
  const controlesParCompte = new Map<string, ControleCompte>();
  let compteCourant = "";
  let nbComptesSuivis = 0;

  let nbReportExclus = 0;
  let nbTotauxCaptures = 0;
  let nbReportsCaptures = 0;
  let nbAmbigus = 0;
  let nbNonExploitees = 0;

  const col = spec.colonnes;
  // Compte-colonne et motif d'en-tete s'excluent (le compte est SOIT une colonne repetee, SOIT
  // suivi via un motif hors tableau). Si une colonne compte existe, on IGNORE le motif meme si
  // l'IA en a fourni un : un motif large peut sinon capturer un pied de page ("1. ADRESSE ...")
  // et creer un faux compte qui vole des ecritures. La colonne est la source fiable.
  const regexEntete = col.compte === null ? compilerRegexEntete(spec.motifEnteteCompte) : null;

  // Tente de reconnaitre un en-tete de compte sur une ligne (brute ou nettoyee). Met a jour le
  // compte courant si trouve. Renvoie true si la ligne EST un en-tete (a ne pas traiter ensuite).
  const essayerEntete = (texte: string): boolean => {
    if (!regexEntete) return false;
    for (const candidat of [texte.trim(), sansDecorationMarkdown(texte)]) {
      const m = regexEntete.exec(candidat);
      if (m && m[1] && m[1].trim()) {
        compteCourant = m[1].trim();
        nbComptesSuivis++;
        return true;
      }
    }
    return false;
  };

  for (const page of pagesMarkdown) {
    const brutes = page.split(/\r?\n/);
    for (const brute of brutes) {
      const ligne = brute.trim();
      if (!ligne) continue;

      if (!estLigneTableau(ligne)) {
        // Hors tableau : seul candidat plausible = en-tete de compte.
        essayerEntete(ligne);
        continue;
      }
      if (estSeparateur(ligne)) continue;

      const cells = decouperCellules(ligne);
      const texteLigne = cells.join(" ").toLowerCase();

      // Ligne de tableau SANS aucun chiffre = en-tete de colonnes ("Date | Libelle | Debit")
      // ou decoration : ni date, ni montant, ni numero de compte -> rien a extraire, on ignore
      // silencieusement (evite de bruiter les notes avec les lignes d'en-tete des tableaux).
      if (!/\d/.test(texteLigne)) continue;

      // Compte de la ligne : si une colonne dediee existe, elle porte le numero UNIQUEMENT sur
      // la ligne d'en-tete du compte (les ecritures laissent cette cellule vide) -> on met a jour
      // le compte courant des qu'elle est renseignee, et on le propage aux ecritures suivantes.
      if (col.compte !== null) {
        const v = cellule(cells, col.compte).trim();
        if (v) {
          if (v !== compteCourant) nbComptesSuivis++;
          compteCourant = v;
        }
      }
      const compte = compteCourant;

      // Ligne de TOTAL d'un compte : exclue des ecritures, mais on capture ses totaux imprimes.
      if (contientMotCle(texteLigne, spec.motsClesTotalCompte)) {
        const td = col.debit !== null ? parseNombreFr(cellule(cells, col.debit)) : null;
        const tc = col.credit !== null ? parseNombreFr(cellule(cells, col.credit)) : null;
        if ((td !== null || tc !== null) && compte) {
          const prec = controlesParCompte.get(compte) ?? { compte };
          if (td !== null) prec.totalDebit = Math.abs(td);
          if (tc !== null) prec.totalCredit = Math.abs(tc);
          controlesParCompte.set(compte, prec);
          nbTotauxCaptures++;
        }
        continue;
      }

      // Ligne d'A-NOUVEAU / solde anterieur d'OUVERTURE : exclue des ecritures (on ne reprend
      // pas les reports) MAIS son montant est CAPTURE par compte -> permet de reconcilier le
      // controle (le "Total compte" imprime INCLUT le report : report + ecritures == total).
      // On teste l'a-nouveau AVANT le report generique (ex. "total mois") pour ne capturer QUE
      // l'ouverture et jamais un sous-total periodique.
      if (contientMotCle(texteLigne, spec.motsClesReportANouveau)) {
        const rd = col.debit !== null ? parseNombreFr(cellule(cells, col.debit)) : null;
        const rc = col.credit !== null ? parseNombreFr(cellule(cells, col.credit)) : null;
        // Presentation montant-signe : le report est porte par la colonne montant (signe).
        let rDeb = rd !== null ? Math.abs(rd) : 0;
        let rCred = rc !== null ? Math.abs(rc) : 0;
        if (spec.presentation !== "deux-colonnes" && col.montant !== null) {
          const rm = parseNombreFr(cellule(cells, col.montant));
          if (rm !== null && Math.abs(rm) >= EPS) {
            const sensPos = rm >= 0 ? spec.signePositif : spec.signePositif === "debit" ? "credit" : "debit";
            if (sensPos === "debit") rDeb = Math.abs(rm);
            else rCred = Math.abs(rm);
          }
        }
        if ((rDeb >= EPS || rCred >= EPS) && compte) {
          const prec = controlesParCompte.get(compte) ?? { compte };
          if (rDeb >= EPS) prec.reportDebit = (prec.reportDebit ?? 0) + rDeb;
          if (rCred >= EPS) prec.reportCredit = (prec.reportCredit ?? 0) + rCred;
          controlesParCompte.set(compte, prec);
          nbReportsCaptures++;
        }
        continue;
      }

      // Ligne de report / solde anterieur / sous-total / total general : simplement exclue.
      if (contientMotCle(texteLigne, spec.motsClesReport)) {
        nbReportExclus++;
        continue;
      }

      const date = cellule(cells, col.date);
      const libelle = cellule(cells, col.libelle);
      const piece = cellule(cells, col.piece);

      let sens: "debit" | "credit" | null = null;
      let montant = 0;

      if (spec.presentation === "deux-colonnes") {
        const d = parseNombreFr(cellule(cells, col.debit));
        const c = parseNombreFr(cellule(cells, col.credit));
        const dNZ = d !== null && Math.abs(d) >= EPS;
        const cNZ = c !== null && Math.abs(c) >= EPS;
        if (dNZ && !cNZ) {
          sens = "debit";
          montant = Math.abs(d as number);
        } else if (cNZ && !dNZ) {
          sens = "credit";
          montant = Math.abs(c as number);
        } else if (dNZ && cNZ) {
          // Debit ET credit remplis : rare. On prend le NET (signe) et on le signale.
          const net = (d as number) - (c as number);
          sens = net >= 0 ? "debit" : "credit";
          montant = Math.abs(net);
          nbAmbigus++;
        }
      } else {
        const m = parseNombreFr(cellule(cells, col.montant));
        if (m !== null && Math.abs(m) >= EPS) {
          const sensCol = cellule(cells, col.sens).trim().toLowerCase();
          if (sensCol.startsWith("d")) sens = "debit";
          else if (sensCol.startsWith("c")) sens = "credit";
          else sens = m >= 0 ? spec.signePositif : spec.signePositif === "debit" ? "credit" : "debit";
          montant = Math.abs(m);
        }
      }

      if (sens === null || montant < EPS) {
        // Aucun montant lisible. Peut etre un en-tete de compte etale sur une ligne de tableau
        // (compte suivi par motif), ou une ligne de decoration : on tente l'en-tete, sinon note.
        if (col.compte === null && essayerEntete(cells.join(" "))) continue;
        // On ne compte comme "non exploitee" que si la ligne portait une date (donc censee etre
        // une ecriture) : evite de bruiter sur les lignes de titre / vides.
        if (date.trim()) nbNonExploitees++;
        continue;
      }

      lignes.push({
        date: date.trim(),
        compte,
        libelle: libelle.trim(),
        sens,
        montant,
        piece: piece.trim() || undefined,
      });
    }
  }

  const notes: string[] = [];
  notes.push(
    `Parseur deterministe (spec IA, ${spec.presentation}) : ${pagesMarkdown.length} page(s), ${lignes.length} ecriture(s), ${nbComptesSuivis} en-tete(s) de compte.`,
  );
  if (nbReportExclus) notes.push(`Parseur : ${nbReportExclus} ligne(s) report/solde/sous-total exclue(s).`);
  if (nbReportsCaptures) notes.push(`Parseur : ${nbReportsCaptures} a-nouveau(x) capture(s) pour reconcilier le controle.`);
  if (nbTotauxCaptures) notes.push(`Parseur : ${nbTotauxCaptures} total(aux) de compte capture(s) pour controle.`);
  if (nbAmbigus) notes.push(`Parseur : ${nbAmbigus} ligne(s) debit ET credit remplis (net retenu).`);
  if (nbNonExploitees) notes.push(`Parseur : ${nbNonExploitees} ligne(s) datee(s) sans montant lisible (ignorees).`);

  return { lignes, controles: [...controlesParCompte.values()], notes };
}

/** Compile le motif d'en-tete en RegExp (ou null si vide/invalide) sans jamais lever. */
function compilerRegexEntete(motif: string): RegExp | null {
  const m = motif.trim();
  if (!m) return null;
  try {
    return new RegExp(m);
  } catch {
    return null;
  }
}
