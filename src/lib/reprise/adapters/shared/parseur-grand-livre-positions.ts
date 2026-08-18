// PARSEUR DETERMINISTE du grand livre a partir de la COUCHE TEXTE POSITIONNEE (PDF natif). PUR,
// zero reseau, entierement testable avec des items synthetiques. C'est la voie preferee pour les
// PDF natifs : les colonnes sont des COORDONNEES (bandes en x), pas des comptages de cellules
// markdown -> plus de cellule fusionnee, plus de valeur dupliquee entre la colonne de mouvement
// et la colonne de solde progressif (la cause prouvee de la corruption Mistral-OCR sur les
// tableaux denses).
//
// AGNOSTIQUE au syndic : on ne code EN DUR aucune position ni aucun compte. On reconnait les
// colonnes par les EN-TETES IMPRIMES ("Debit", "Credit", "Solde", "Debiteur", "Crediteur") que
// tout grand livre francais imprime, detectes PAR PAGE (les positions varient d'un sous-rapport a
// l'autre). Les montants de MOUVEMENT (Debit / Credit) sont retenus ; les colonnes de solde /
// cumul progressif sont ecartees. Le suivi des comptes, l'exclusion des reports/sous-totaux et la
// capture des totaux imprimes reprennent la meme semantique que le parseur markdown existant.

import { parseNombreFr } from "@/lib/reprise/adapters/shared/parseur-grand-livre";
import type {
  LigneEcritureBrute,
  ResultatParsage,
} from "@/lib/reprise/adapters/shared/parseur-grand-livre";
import type { ControleCompte } from "@/lib/reprise/domain/ecriture";
import type { ItemTexte, PageTexte } from "@/lib/reprise/adapters/shared/pdf-texte";
import {
  dedoublonnerItems,
  extraireDate,
  plier,
  tokensFold,
} from "@/lib/reprise/adapters/shared/texte-positions";

/** Sous ce montant (EUR), une cellule est consideree vide / bruit d'arrondi. */
const EPS = 0.005;

/**
 * Numero de compte plausible : commence par une classe 1..7, au moins 3 chiffres, suffixe pointe
 * optionnel (ex. "4501.100489139", "1031.000000000", "512"). Ancre les DEUX bouts pour ne PAS
 * capturer une adresse ("44/50 RUE...") ni une date ("24/10/2025", cassee par le "/").
 */
const RE_COMPTE = /^[1-7]\d{2,}(?:\.\d+)?$/;

/** Mots-cles (sans accents, minuscule) des lignes de synthese. Termes comptables FR standard. */
const MC_TOTAL_COMPTE = ["total compte"];
const MC_A_NOUVEAU = ["solde anterieur", "a nouveau", "a-nouveau", "report a nouveau"];
const MC_REPORT = ["total mois", "sous total", "sous-total", "total general", "total classe", "total class"];

/**
 * En-tete de compte "sur sa propre ligne" : "1031001 - Avances de tresorerie" (format Matera,
 * mesure sur S0303). Le numero et l'intitule sont dans le MEME item, separes par " - ". L'ancre
 * ^ empeche une ligne d'ecriture d'y matcher (elle commence par une date ou un code journal).
 * NB : une tete de SECTION ("103 - Avances") matche aussi -> compte transitoire aussitot
 * remplace par le vrai compte feuille de la ligne suivante ; sans ecriture entre les deux,
 * c'est sans effet.
 */
const RE_ENTETE_NUMERO_LIBELLE = /^([1-7]\d{2,}(?:\.\d+)?)\s*-\s*(.+)$/;

/**
 * Total de SECTION ("Total 103 - Avances", "Total 450 - Coproprietaires") : a EXCLURE, et il
 * CLOT le bloc courant. Sans cette cloture, la ligne "Total" qui suit le recapitulatif de
 * section serait attribuee au dernier compte feuille et ECRASERAIT son total de controle
 * (le total de section = la somme de la section, pas celui du compte).
 */
const RE_TOTAL_SECTION = /^total\s+[1-7]\d/;

/** Colonnes de montant detectees sur une page : ancres x des mouvements + zones a exclure. */
export interface ColonnesMontant {
  /** Centre x de la colonne Debit (mouvement). */
  debitX: number;
  /** Centre x de la colonne Credit (mouvement). */
  creditX: number;
  /** Centres x des colonnes a EXCLURE (solde / cumul progressif : debiteur, crediteur, solde). */
  exclusionsX: number[];
  /** Frontiere gauche de la zone des montants : a gauche = texte, a droite = montants. */
  montantMinX: number;
}

function contient(texteFold: string, motsCles: string[]): boolean {
  return motsCles.some((m) => texteFold.includes(m));
}

/**
 * Detecte les colonnes de montant d'une page a partir de ses EN-TETES imprimes. On cherche la
 * ligne portant a la fois "debit" et "credit", puis on rassemble une petite fenetre verticale (les
 * en-tetes s'etalent souvent sur 2-3 lignes : "Solde" au-dessus, "Debiteur/Crediteur" en dessous)
 * et on releve le centre x de chaque en-tete. Renvoie null si on ne trouve pas les DEUX colonnes
 * de mouvement (ex. presentation "montant signe") -> l'appelant garde alors le pipeline OCR.
 */
export function detecterColonnes(page: PageTexte): ColonnesMontant | null {
  const lignes = page.lignes;
  let idxEntete = -1;
  for (let i = 0; i < lignes.length; i++) {
    // Tokens EXACTS : une ligne d'ecriture contenant "Creditor Name" (mention SEPA) ne doit
    // pas etre prise pour la ligne d'en-tete.
    const tokens = new Set(tokensFold(lignes[i]!.items.map((it) => it.chaine).join(" ")));
    if (tokens.has("debit") && tokens.has("credit")) {
      idxEntete = i;
      break;
    }
  }
  if (idxEntete < 0) return null;

  const fenetre: ItemTexte[] = [];
  for (let i = Math.max(0, idxEntete - 2); i <= Math.min(lignes.length - 1, idxEntete + 2); i++) {
    fenetre.push(...lignes[i]!.items);
  }

  let debitX: number | null = null;
  let creditX: number | null = null;
  const exclusionsX: number[] = [];
  for (const it of fenetre) {
    const tokens = new Set(tokensFold(it.chaine));
    const centre = it.x + it.largeur / 2;
    // On teste les EXCLUSIONS d'abord ("Solde debiteur" porte le token "debiteur") ; tokens
    // exacts partout, sinon "Creditor" (libelles SEPA) ou "debite" voleraient une ancre.
    if (tokens.has("debiteur") || tokens.has("crediteur") || tokens.has("solde") || tokens.has("cumul") || tokens.has("progressif")) {
      exclusionsX.push(centre);
    } else if (tokens.has("debit")) {
      debitX = centre;
    } else if (tokens.has("credit")) {
      creditX = centre;
    }
  }
  if (debitX === null || creditX === null) return null;
  const montantMinX = Math.min(debitX, creditX) - 20;
  return { debitX, creditX, exclusionsX, montantMinX };
}

/**
 * Classe les montants d'une ligne : chaque item numerique de la zone montants est rattache a
 * l'ancre la PLUS PROCHE (debit / credit / exclusion). Seuls Debit et Credit sont retenus ; les
 * colonnes de solde progressif (qui DUPLIQUENT le montant du mouvement) sont ecartees.
 */
function classerMontants(items: ItemTexte[], col: ColonnesMontant): { debit: number; credit: number } {
  const ancres: { x: number; role: "debit" | "credit" | "exclu" }[] = [
    { x: col.debitX, role: "debit" },
    { x: col.creditX, role: "credit" },
    ...col.exclusionsX.map((x) => ({ x, role: "exclu" as const })),
  ];
  let debit = 0;
  let credit = 0;
  for (const it of items) {
    const centre = it.x + it.largeur / 2;
    if (centre < col.montantMinX) continue; // zone texte
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
    if (role === "debit") debit += Math.abs(n);
    else if (role === "credit") credit += Math.abs(n);
  }
  return { debit, credit };
}

/**
 * Applique le parsage POSITIONNE a l'ensemble des pages. Suit le compte courant (ligne d'en-tete
 * de compte = 1er token = numero de compte), transcrit chaque ecriture (Debit XOR Credit), exclut
 * reports / sous-totaux, et CAPTURE les totaux imprimes + reports a-nouveau par compte comme
 * points de controle (meme reconciliation que le pipeline markdown). Aucun libelle/nom ne fuit
 * dans les notes (agregats seulement).
 */
export function parserGrandLivrePositions(pages: PageTexte[]): ResultatParsage {
  const lignes: LigneEcritureBrute[] = [];
  const controlesParCompte = new Map<string, ControleCompte>();
  // Intitule de compte capture depuis la ligne d'en-tete (le texte apres le numero de compte).
  // PII (noms) : reste dans la structure de sortie, jamais logue dans les notes.
  const intitulesParCompte = new Map<string, string>();
  let compteCourant = "";
  let colPrec: ColonnesMontant | null = null;

  let nbEntetes = 0;
  let nbTotaux = 0;
  let nbReportsCaptures = 0;
  let nbReportsExclus = 0;
  let nbAmbigus = 0;
  let nbPagesSansColonnes = 0;
  let nbDoublesRetires = 0;

  for (const page of pages) {
    const detecte = detecterColonnes(page);
    const col = detecte ?? colPrec;
    if (!col) {
      // Ni en-tete Debit/Credit sur cette page, ni modele herite d'une page precedente.
      nbPagesSansColonnes++;
      continue;
    }
    if (detecte) colPrec = detecte;

    for (const ligne of page.lignes) {
      // Faux gras (meme chaine dessinee deux fois au meme endroit) : dedoublonne AVANT tout,
      // sinon intitules dupliques et montants ADDITIONNES en double.
      const dedouble = dedoublonnerItems(ligne.items);
      nbDoublesRetires += dedouble.retires;
      const itemsLigne = dedouble.items;

      const itemsTexte = itemsLigne.filter((it) => it.x + it.largeur / 2 < col.montantMinX);
      const texte = itemsTexte.map((it) => it.chaine).join(" ").replace(/\s+/g, " ").trim();
      const texteFold = plier(texte);
      const premierToken = (itemsTexte[0]?.chaine ?? "").trim();

      // En-tete de compte : le 1er token de la zone texte est un numero de compte (les ecritures
      // commencent, elles, par un code journal alphabetique). Met a jour le compte courant.
      if (RE_COMPTE.test(premierToken)) {
        compteCourant = premierToken;
        nbEntetes++;
        // Le reste de la zone texte (apres le numero) est l'INTITULE imprime du compte (nom du
        // fournisseur / coproprietaire...). On le garde pour l'appariement par nom du mapping.
        const intitule = itemsTexte
          .slice(1)
          .map((it) => it.chaine)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (intitule && !intitulesParCompte.has(compteCourant)) {
          intitulesParCompte.set(compteCourant, intitule);
        }
        continue;
      }

      // En-tete de compte "numero - libelle" dans un SEUL item (format Matera). Meme semantique
      // que ci-dessus, autre mise en page. Une tete de section ("103 - Avances") matche aussi :
      // compte transitoire sans effet (aucune ecriture avant le compte feuille qui suit).
      const enTeteLibelle = texte.match(RE_ENTETE_NUMERO_LIBELLE);
      if (enTeteLibelle) {
        compteCourant = enTeteLibelle[1]!;
        nbEntetes++;
        const intitule = enTeteLibelle[2]!.replace(/\s+/g, " ").trim();
        if (intitule && !intitulesParCompte.has(compteCourant)) {
          intitulesParCompte.set(compteCourant, intitule);
        }
        continue;
      }

      const { debit, credit } = classerMontants(itemsLigne, col);
      const dNZ = debit >= EPS;
      const cNZ = credit >= EPS;

      // Total de SECTION ("Total 103 - Avances") : exclu, et il CLOT le bloc courant - la ligne
      // "Total" du recapitulatif de section ne doit pas ecraser le total du dernier compte.
      if (RE_TOTAL_SECTION.test(texteFold)) {
        nbReportsExclus++;
        compteCourant = "";
        continue;
      }

      // Ligne de TOTAL d'un compte : exclue des ecritures, mais ses totaux imprimes sont captures.
      // Deux formes reelles : "Total compte XXX" (S0302) et "Total" seul en fin de bloc (Matera).
      const totalSeul = texteFold === "total";
      if (contient(texteFold, MC_TOTAL_COMPTE) || totalSeul) {
        if (compteCourant) {
          const prec = controlesParCompte.get(compteCourant) ?? { compte: compteCourant };
          prec.totalDebit = debit;
          prec.totalCredit = credit;
          controlesParCompte.set(compteCourant, prec);
          nbTotaux++;
        }
        // "Total" seul TERMINE le bloc (mise en page Matera) : ce qui suit (recap de section)
        // n'appartient plus a ce compte.
        if (totalSeul) compteCourant = "";
        continue;
      }

      // Ligne d'A-NOUVEAU / solde anterieur d'ouverture : exclue des ecritures MAIS son montant est
      // capture par compte -> le total imprime inclut le report, donc report + ecritures == total.
      if (contient(texteFold, MC_A_NOUVEAU)) {
        if (compteCourant && (dNZ || cNZ)) {
          const prec = controlesParCompte.get(compteCourant) ?? { compte: compteCourant };
          if (dNZ) prec.reportDebit = (prec.reportDebit ?? 0) + debit;
          if (cNZ) prec.reportCredit = (prec.reportCredit ?? 0) + credit;
          controlesParCompte.set(compteCourant, prec);
          nbReportsCaptures++;
        }
        continue;
      }

      // Sous-total periodique / total mois / total general / total classe : simplement exclu.
      if (contient(texteFold, MC_REPORT)) {
        nbReportsExclus++;
        continue;
      }

      if (!dNZ && !cNZ) continue; // ligne sans mouvement (titre, sous-en-tete, pied de page)

      let sens: "debit" | "credit";
      let montant: number;
      if (dNZ && cNZ) {
        // Debit ET credit sur la meme ligne : rare -> on prend le net (signe) et on le signale.
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
        date: extraireDate(texte),
        compte: compteCourant,
        libelle: texte,
        sens,
        montant,
      });
    }
  }

  const notes: string[] = [];
  notes.push(
    `Parseur positions (couche texte native) : ${pages.length} page(s), ${lignes.length} ecriture(s), ${nbEntetes} en-tete(s) de compte.`,
  );
  if (nbReportsExclus) notes.push(`Parseur positions : ${nbReportsExclus} sous-total(aux)/report(s) exclu(s).`);
  if (nbReportsCaptures) notes.push(`Parseur positions : ${nbReportsCaptures} a-nouveau(x) capture(s) pour reconcilier le controle.`);
  if (nbTotaux) notes.push(`Parseur positions : ${nbTotaux} total(aux) de compte capture(s) pour controle.`);
  if (nbAmbigus) notes.push(`Parseur positions : ${nbAmbigus} ligne(s) debit ET credit (net retenu).`);
  if (nbPagesSansColonnes) notes.push(`Parseur positions : ${nbPagesSansColonnes} page(s) sans en-tete Debit/Credit exploitable.`);
  if (nbDoublesRetires) notes.push(`Parseur positions : ${nbDoublesRetires} item(s) dessine(s) en double retire(s) (faux gras).`);

  return {
    lignes,
    controles: [...controlesParCompte.values()],
    notes,
    intitules: Object.fromEntries(intitulesParCompte),
  };
}
