// PARSEUR DETERMINISTE du grand livre a COLONNES ALIGNEES A DROITE (3e format rencontre,
// S0304 : l'ancien syndic du sortant). PUR, zero reseau, testable avec des items synthetiques.
// Port fidele du script prouve du skill estale-migration (parse_gl_colonnes_droite.py,
// valide sur le GL reel : 2 535 ecritures, 232 totaux imprimes a 0 ecart).
//
// Ce format se distingue du format "positions" deja gere (Matera, colonnes reperees par le
// CENTRE des en-tetes) par des colonnes calees a DROITE : un montant s'identifie par le x1
// (bord droit) de son dernier token, une regularite parfaite sur tout le document. Les ancres
// viennent des EN-TETES IMPRIMES de chaque page (jamais de position en dur) :
//   C.J | Date de valeur | Date | Reference facture | Ecriture | Compte | Libelle |
//   Debit | Credit | Solde | Solde "AGE"
// Les TROIS colonnes de solde progressif (Solde debit, Solde credit, Solde "AGE") sont
// ECARTEES (regle du skill : jamais reprendre un cumul).
//
// Autres proprietes du format :
//   - en-tete de compte "4010.400084191 NOM" en milieu de page (x0 au-dela de la colonne
//     Compte), les ecritures ne repetent pas le compte ;
//   - "Solde anterieur" = report a-nouveau (capture, jamais une ecriture ; ACCUMULE : un
//     sortant qui a lui-meme repris en cours d'exercice imprime DEUX ouvertures) ;
//   - "Total Compte <code>" = total imprime (filet n.1), et il CLOT le compte courant ;
//   - "Total Mois", "Sous total class", "Total Immeuble" (le total general du format) ignores ;
//   - code journal en colonne 1 (VECC, BQEN, AFCC, OD...) ; DEUX dates par ligne : la date de
//     VALEUR (1re) situe l'ecriture dans l'exercice, la date de saisie (2e) est ignoree ;
//   - separateur de milliers parfois rendu en token separe ("1" + "811,63") : recolle ;
//   - REGLE ABSOLUE : toute ligne portant un montant en zone Debit/Credit et non reconnue va
//     au JOURNAL D'ANOMALIES - il doit finir a ZERO, jamais un ecart silencieux.

import { parseNombreFr } from "@/lib/reprise/adapters/shared/parseur-grand-livre";
import type {
  LigneEcritureBrute,
  ResultatParsage,
} from "@/lib/reprise/adapters/shared/parseur-grand-livre";
import type { ControleCompte } from "@/lib/reprise/domain/ecriture";
import type { ItemTexte, LigneTexte, PageTexte } from "@/lib/reprise/adapters/shared/pdf-texte";

/** Sous ce montant (EUR), une cellule est consideree vide / bruit d'arrondi. */
const EPS = 0.005;

/** En-tete de compte du format : code pointe "4010.400084191" (le point est structurel). */
const RE_ENTETE_COMPTE = /^(\d{3,7})\.(\d+)$/;

/** Un montant francais complet (espaces de milliers normal/insecable/fin toleres). */
const RE_MONTANT = /^-?\d{1,3}(?:[\u00a0\u202f\u2009 ]\d{3})*,\d\d$/;

/** Fragment de montant : un groupe de 1 a 3 chiffres (partie gauche d'un nombre eclate). */
const RE_FRAGMENT = /^-?\d{1,3}$/;

/** Date JJ/MM/AAAA (les deux dates de la ligne : valeur puis saisie). */
const RE_DATE = /^\d{2}\/\d{2}\/\d{4}$/;

/** Code journal du format (VECC, BQEN, AFCC, OD, FAHO...) : 2 a 5 majuscules. */
const RE_JOURNAL = /^[A-Z]{2,5}$/;

/** Lignes de synthese a ignorer purement et simplement (jamais des ecritures). */
const MC_IGNOREES = [
  "total mois",
  "total general",
  "sous total",
  "sous-total",
  "total immeuble", // le "total general" de ce format (derniere page)
  "grand livre",
  "residence",
];

/** Ligne d'anomalie : portait un montant en zone Debit/Credit mais n'a pas ete reconnue.
 *  ATTENTION PII : `texte` peut porter un nom -> diagnostic interne, jamais dans une note. */
export interface AnomalieColonnesDroite {
  page: number;
  compte: string;
  texte: string;
}

/** Sortie du parseur : le contrat commun + le journal d'anomalies (doit finir a zero). */
export interface ResultatParsageColonnesDroite extends ResultatParsage {
  anomalies: AnomalieColonnesDroite[];
}

/** Ancres d'une page, calees sur ses en-tetes imprimes (x1 = bord droit des colonnes). */
export interface ColonnesDroite {
  /** x1 de l'en-tete Debit (colonne de mouvement). */
  debitX1: number;
  /** x1 de l'en-tete Credit (colonne de mouvement). */
  creditX1: number;
  /** x1 des en-tetes de solde progressif, tous ECARTES. */
  exclusionsX1: number[];
  /** Frontiere gauche de la zone montants (un peu avant l'en-tete Debit). */
  montantMinX: number;
  /** Seuil x0 au-dela duquel un code pointe est un EN-TETE de compte (colonne Compte). */
  seuilEnteteCompteX: number;
  /** x0 maximal du code journal (colonne C.J). */
  maxJournalX: number;
  /** Debut de la zone libelle (apres la colonne Compte). */
  libelleMinX: number;
}

/** Minuscule + sans accents : matching robuste des en-tetes et mots-cles. */
function plier(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function texteDeLigne(items: ItemTexte[]): string {
  return items.map((it) => it.chaine).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Detecte les ancres d'une page depuis sa ligne d'en-tetes imprimee (celle qui porte a la
 * fois "C.J" et "Date de valeur"). Renvoie null si la page n'imprime pas cette ligne (page
 * de garde, page hors format) : l'appelant reutilise alors la calibration precedente.
 */
export function detecterColonnesDroite(page: PageTexte): ColonnesDroite | null {
  for (const ligne of page.lignes) {
    const t = plier(texteDeLigne(ligne.items));
    if (!(t.includes("c.j") && t.includes("date de valeur") && t.includes("debit") && t.includes("credit"))) {
      continue;
    }
    let debitX1: number | null = null;
    let creditX1: number | null = null;
    const exclusionsX1: number[] = [];
    let compteX0: number | null = null;
    let compteX1: number | null = null;
    let cjX1: number | null = null;
    for (const it of ligne.items) {
      const mot = plier(it.chaine.trim());
      const x1 = it.x + it.largeur;
      if (mot.includes("solde")) exclusionsX1.push(x1);
      else if (mot === "debit") debitX1 = x1;
      else if (mot === "credit") creditX1 = x1;
      else if (mot === "compte") {
        compteX0 = it.x;
        compteX1 = x1;
      } else if (mot === "c.j") cjX1 = x1;
    }
    if (debitX1 === null || creditX1 === null) return null;
    return {
      debitX1,
      creditX1,
      exclusionsX1,
      // L'en-tete "Debit" est imprime un peu a GAUCHE du bord droit des montants : on ouvre
      // la zone montants avec une marge (geometrie reelle : en-tete Debit finit vers ~571,
      // le plus large montant commence vers ~546, le plus long libelle finit vers ~526).
      montantMinX: Math.min(debitX1, creditX1) - 40,
      seuilEnteteCompteX: (compteX0 ?? 330) - 40,
      maxJournalX: (cjX1 ?? 51) + 10,
      libelleMinX: (compteX1 ?? 349) + 5,
    };
  }
  return null;
}

/**
 * Un jeu de pages est-il au format "colonnes alignees a droite" ? On cherche la ligne
 * d'en-tetes caracteristique (C.J + Date de valeur) sur les premieres pages. Sert au
 * provider a choisir ce parseur plutot que le parseur positions (format Matera).
 */
export function detecterFormatColonnesDroite(pages: PageTexte[]): boolean {
  return pages.slice(0, 5).some((p) => detecterColonnesDroite(p) !== null);
}

/** Un montant recolle : sa valeur et le x1 de son DERNIER token (l'identite de colonne). */
interface MontantPositionne {
  x1: number;
  valeur: number;
}

/**
 * Recolle les tokens d'un meme nombre (separateur de milliers parfois rendu en token separe :
 * "1" + "811,63") et rend chaque montant avec le x1 de son dernier token. Port fidele de
 * groupes() du script Python : un fragment trop eloigne (> 6 unites) du precedent ouvre un
 * nouveau nombre ; un token deja complet ("11 917,04" d'un seul tenant) sort directement.
 */
export function grouperMontantsDroite(items: ItemTexte[]): MontantPositionne[] {
  const out: MontantPositionne[] = [];
  let buf: ItemTexte[] = [];
  const tries = [...items].sort((a, b) => a.x - b.x);
  for (const it of tries) {
    const t = it.chaine.trim();
    if (RE_FRAGMENT.test(t) || RE_MONTANT.test(t)) {
      if (buf.length > 0 && it.x - (buf[buf.length - 1]!.x + buf[buf.length - 1]!.largeur) > 6) {
        // Trop loin du fragment precedent : le buffer etait un autre nombre (complet ou non).
        const s = buf.map((b) => b.chaine.trim()).join(" ");
        if (RE_MONTANT.test(s)) {
          const v = parseNombreFr(s);
          const dernier = buf[buf.length - 1]!;
          if (v !== null) out.push({ x1: dernier.x + dernier.largeur, valeur: v });
        }
        buf = [];
      }
      buf.push(it);
      const s = buf.map((b) => b.chaine.trim()).join(" ");
      if (RE_MONTANT.test(s) && !/^\d+$/.test(t)) {
        // Le buffer forme un montant complet et le token courant porte les decimales : emis.
        const v = parseNombreFr(s);
        if (v !== null) out.push({ x1: it.x + it.largeur, valeur: v });
        buf = [];
      }
    } else {
      buf = [];
    }
  }
  return out;
}

/** Somme des montants rattaches a une ancre x1 donnee (plus proche voisin parmi les ancres). */
function sommerParColonne(
  montants: MontantPositionne[],
  col: ColonnesDroite,
): { debit: number; credit: number; horsMouvement: boolean } {
  const ancres: { x1: number; role: "debit" | "credit" | "exclu" }[] = [
    { x1: col.debitX1, role: "debit" },
    { x1: col.creditX1, role: "credit" },
    ...col.exclusionsX1.map((x1) => ({ x1, role: "exclu" as const })),
  ];
  let debit = 0;
  let credit = 0;
  let horsMouvement = false;
  for (const m of montants) {
    if (m.x1 < col.montantMinX) continue; // zone texte (n° d'ecriture, ref facture...)
    let role = ancres[0]!.role;
    let dist = Math.abs(m.x1 - ancres[0]!.x1);
    for (const a of ancres) {
      const d = Math.abs(m.x1 - a.x1);
      if (d < dist) {
        dist = d;
        role = a.role;
      }
    }
    if (role === "debit") debit += Math.abs(m.valeur);
    else if (role === "credit") credit += Math.abs(m.valeur);
    else horsMouvement = true;
  }
  return { debit, credit, horsMouvement };
}

/** La ligne d'en-tetes de colonnes elle-meme (a ignorer lors du parcours des lignes). */
function estLigneEnTetes(texteFold: string): boolean {
  return texteFold.includes("c.j") && texteFold.includes("date de valeur");
}

/**
 * Applique le parsage "colonnes a droite" a l'ensemble des pages. Suit le compte courant
 * (en-tete "code.suffixe NOM"), transcrit chaque ligne portee par un code journal (la date
 * de VALEUR fait foi), exclut les syntheses, CAPTURE reports et totaux imprimes comme points
 * de controle, et consigne au journal d'anomalies TOUTE ligne a montant non reconnue.
 */
export function parserGrandLivreColonnesDroite(pages: PageTexte[]): ResultatParsageColonnesDroite {
  const lignes: LigneEcritureBrute[] = [];
  const controlesParCompte = new Map<string, ControleCompte>();
  const intitulesParCompte = new Map<string, string>();
  const anomalies: AnomalieColonnesDroite[] = [];
  let compteCourant = "";
  let colPrec: ColonnesDroite | null = null;

  let nbEntetes = 0;
  let nbTotaux = 0;
  let nbReportsCaptures = 0;
  let nbIgnorees = 0;
  let nbAmbigus = 0;
  let nbPagesSansColonnes = 0;

  for (let pno = 0; pno < pages.length; pno++) {
    const page = pages[pno]!;
    const detecte = detecterColonnesDroite(page);
    const col = detecte ?? colPrec;
    if (!col) {
      nbPagesSansColonnes++;
      continue;
    }
    if (detecte) colPrec = detecte;

    for (const ligne of page.lignes as LigneTexte[]) {
      const itemsTexte = ligne.items.filter((it) => it.x + it.largeur < col.montantMinX);
      const texte = texteDeLigne(itemsTexte);
      const texteFold = plier(texte);
      const premier = itemsTexte[0];
      const premierToken = (premier?.chaine ?? "").trim();

      if (estLigneEnTetes(plier(texteDeLigne(ligne.items)))) continue;

      // --- En-tete de compte : code pointe au niveau de la colonne Compte. Le point est
      // structurel dans ce format : un libelle SEPA replie "2026 - NOM" ne peut pas matcher
      // (garde "un millesime n'est jamais un compte", piege mesure sur S0304).
      if (premier && RE_ENTETE_COMPTE.test(premierToken) && premier.x > col.seuilEnteteCompteX) {
        compteCourant = premierToken;
        nbEntetes++;
        const intitule = texteDeLigne(itemsTexte.slice(1));
        if (intitule && !intitulesParCompte.has(compteCourant)) {
          intitulesParCompte.set(compteCourant, intitule);
        }
        continue;
      }

      const montants = grouperMontantsDroite(ligne.items);
      const { debit, credit } = sommerParColonne(montants, col);
      const dNZ = debit >= EPS;
      const cNZ = credit >= EPS;

      // --- "Total Compte <code>" : total imprime capture (filet n.1), et il CLOT le compte.
      if (texteFold.startsWith("total compte")) {
        if (compteCourant) {
          const prec = controlesParCompte.get(compteCourant) ?? { compte: compteCourant };
          prec.totalDebit = debit;
          prec.totalCredit = credit;
          controlesParCompte.set(compteCourant, prec);
          nbTotaux++;
        }
        compteCourant = "";
        continue;
      }

      // --- "Solde anterieur" : report a-nouveau, capture et ACCUMULE (un sortant qui a
      // lui-meme repris en cours d'exercice imprime deux ouvertures pour un meme compte).
      if (texteFold.startsWith("solde anterieur")) {
        if (compteCourant && (dNZ || cNZ)) {
          const prec = controlesParCompte.get(compteCourant) ?? { compte: compteCourant };
          if (dNZ) prec.reportDebit = (prec.reportDebit ?? 0) + debit;
          if (cNZ) prec.reportCredit = (prec.reportCredit ?? 0) + credit;
          controlesParCompte.set(compteCourant, prec);
          nbReportsCaptures++;
        }
        continue;
      }

      // --- Syntheses ignorees (total mois, sous total classe, total immeuble, decor de page).
      if (MC_IGNOREES.some((m) => texteFold.startsWith(m))) {
        if (dNZ || cNZ) nbIgnorees++;
        continue;
      }

      // --- Ligne de donnees : code journal en colonne 1 (zone C.J).
      if (premier && RE_JOURNAL.test(premierToken) && premier.x < col.maxJournalX) {
        if (!dNZ && !cNZ) continue; // repli de libelle commencant par un mot court en majuscules
        const dates = itemsTexte
          .map((it) => it.chaine.trim())
          .filter((t) => RE_DATE.test(t));
        const libelle = texteDeLigne(itemsTexte.filter((it) => it.x >= col.libelleMinX));
        if (!compteCourant) {
          // Un mouvement sans compte courant est une PERTE d'information : au journal.
          anomalies.push({ page: pno + 1, compte: "", texte: texte.slice(0, 110) });
          continue;
        }
        let sens: "debit" | "credit";
        let montant: number;
        if (dNZ && cNZ) {
          // Debit ET credit sur la meme ligne : rare -> net signe, et on le signale.
          const net = debit - credit;
          sens = net >= 0 ? "debit" : "credit";
          montant = Math.abs(net);
          nbAmbigus++;
        } else if (dNZ) {
          sens = "debit";
          montant = debit;
        } else {
          sens = "credit";
          montant = credit;
        }
        lignes.push({
          // La DATE DE VALEUR (1re des deux dates) situe l'ecriture dans l'exercice.
          date: dates[0] ?? "",
          compte: compteCourant,
          libelle,
          sens,
          montant,
        });
        continue;
      }

      // --- Rien reconnu mais un montant en zone Debit/Credit : JOURNAL D'ANOMALIES.
      if (dNZ || cNZ) {
        anomalies.push({ page: pno + 1, compte: compteCourant, texte: texte.slice(0, 110) });
      }
    }
  }

  const notes: string[] = [];
  notes.push(
    `Parseur colonnes a droite : ${pages.length} page(s), ${lignes.length} ecriture(s), ${nbEntetes} en-tete(s) de compte.`,
  );
  if (nbReportsCaptures) notes.push(`Parseur colonnes a droite : ${nbReportsCaptures} report(s) "Solde anterieur" capture(s).`);
  if (nbTotaux) notes.push(`Parseur colonnes a droite : ${nbTotaux} total(aux) de compte capture(s) pour controle.`);
  if (nbIgnorees) notes.push(`Parseur colonnes a droite : ${nbIgnorees} ligne(s) de synthese (total mois/classe/immeuble) ecartee(s).`);
  if (nbAmbigus) notes.push(`Parseur colonnes a droite : ${nbAmbigus} ligne(s) debit ET credit (net retenu).`);
  if (nbPagesSansColonnes) notes.push(`Parseur colonnes a droite : ${nbPagesSansColonnes} page(s) sans en-tetes exploitables.`);
  if (anomalies.length) {
    notes.push(
      `Parseur colonnes a droite : ${anomalies.length} ligne(s) A MONTANT NON RECONNUES (journal d'anomalies) - ce compteur doit etre a ZERO avant toute reprise.`,
    );
  }

  return {
    lignes,
    controles: [...controlesParCompte.values()],
    notes,
    intitules: Object.fromEntries(intitulesParCompte),
    anomalies,
  };
}
