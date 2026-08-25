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
import { dedupliquerItems } from "@/lib/reprise/adapters/shared/parseur-rgd";

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

/** Minuscule + sans accents : matching robuste des en-tetes et mots-cles. */
function plier(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
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
    const t = plier(lignes[i]!.items.map((it) => it.chaine).join(" "));
    if (t.includes("debit") && t.includes("credit")) {
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
    const mot = plier(it.chaine.trim());
    const centre = it.x + it.largeur / 2;
    // Tokens EXACTS, jamais includes() (regle du skill) : un libelle SEPA "Creditor Name"
    // present dans la fenetre CAPTE l'ancre credit et vole la colonne - mesure sur S0302
    // (ecart 16 763,73 avec disparition d'une page de reglements) ET sur le GL Matera S0304
    // (ancre credit volee a x=356, 123 342,27 de credits perdus).
    // On teste les EXCLUSIONS d'abord : "debiteur" contient "debit", "crediteur" contient
    // "credit" -> sinon un en-tete de solde volerait la colonne de mouvement.
    if (
      mot === "debiteur" ||
      mot === "crediteur" ||
      mot === "solde" ||
      mot.startsWith("solde ") ||
      mot === "cumul" ||
      mot === "progressif"
    ) {
      exclusionsX.push(centre);
    } else if (mot === "debit") {
      debitX = centre;
    } else if (mot === "credit") {
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

const MOIS_FR: Record<string, string> = {
  janvier: "01", fevrier: "02", mars: "03", avril: "04", mai: "05", juin: "06",
  juillet: "07", aout: "08", septembre: "09", octobre: "10", novembre: "11", decembre: "12",
};

/**
 * Extrait la date d'une ligne : d'abord une date EN TOUTES LETTRES en tete de ligne ("01 avril
 * 2025", format Matera - prioritaire car le libelle peut porter une date numerique parasite,
 * ex. "Appel de fonds 01/04/2025"), sinon la premiere date numerique JJ/MM/AAAA rencontree.
 */
function extraireDate(texte: string): string {
  const fr = plier(texte).match(/^(\d{1,2}|1er)\s+([a-z]+)\s+(\d{4})\b/);
  if (fr) {
    const mois = MOIS_FR[fr[2]!];
    if (mois) {
      const jour = fr[1] === "1er" ? "01" : fr[1]!.padStart(2, "0");
      return `${jour}/${mois}/${fr[3]}`;
    }
  }
  const m = texte.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  return m ? m[0] : "";
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
      // Faux gras rendu par pdfjs = le meme item imprime DEUX fois au meme endroit (mesure sur
      // le GL Matera S0304, titres de comptes et de sections) : dedoublonne avant tout.
      const itemsLigne = dedupliquerItems(ligne.items);
      const itemsTexte = itemsLigne.filter((it) => it.x + it.largeur / 2 < col.montantMinX);
      const texte = itemsTexte.map((it) => it.chaine).join(" ").replace(/\s+/g, " ").trim();
      const texteFold = plier(texte);
      const premierToken = (itemsTexte[0]?.chaine ?? "").trim();

      const { debit, credit } = classerMontants(itemsLigne, col);
      const dNZ = debit >= EPS;
      const cNZ = credit >= EPS;

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

      // En-tete de compte rendu en UN SEUL item ("1031001 - Avances de tresorerie", frequent
      // avec pdfjs sur les GL Matera). Une ligne SANS montant seulement : les ecritures, elles,
      // commencent par une date. Gardes : jamais un "Total ...", jamais un MILLESIME (un libelle
      // SEPA replie "2026 - Creditor Name" imitant un en-tete a detourne 112 ecritures, S0304).
      // Une section ("103 - Avances") puis sa feuille ("1031001 - ...") : la feuille, imprimee
      // juste apres, devient naturellement le compte courant - c'est elle qui recoit les lignes.
      const mEnteteItem = !dNZ && !cNZ ? /^(\d{3,7})\s*-\s*(.+)$/.exec(texte) : null;
      if (mEnteteItem && !texteFold.startsWith("total") && !/^(19|20)\d{2}$/.test(mEnteteItem[1]!)) {
        compteCourant = mEnteteItem[1]!;
        nbEntetes++;
        const intitule = mEnteteItem[2]!.replace(/\s+/g, " ").trim();
        if (intitule && !intitulesParCompte.has(compteCourant)) {
          intitulesParCompte.set(compteCourant, intitule);
        }
        continue;
      }

      // Total de SECTION ("Total 103 - Avances") : il clot un BLOC de comptes, pas un compte -
      // le confondre avec un total de compte ecrase le total de la derniere feuille (piege
      // mesure, skill : "tester la STRUCTURE, jamais la chaine" - Total + code + tiret).
      // Il CLOT aussi le compte courant : le format repete ensuite un bloc recapitulatif avec
      // un "Total" NU portant le total de la SECTION - sans cette cloture, ce total ecraserait
      // celui de la derniere feuille (mesure sur le GL Matera S0304 : 18 comptes corrompus).
      if (/^total\s+\d{3,7}\s*-/.test(texteFold)) {
        compteCourant = "";
        nbReportsExclus++;
        continue;
      }

      // Ligne de TOTAL d'un compte : exclue des ecritures, mais ses totaux imprimes sont captures.
      // Deux formes : "Total Compte <code>" (mot-cle) ou un "Total" NU en fin de compte (Matera).
      if (contient(texteFold, MC_TOTAL_COMPTE) || texteFold === "total") {
        if (compteCourant) {
          const prec = controlesParCompte.get(compteCourant) ?? { compte: compteCourant };
          prec.totalDebit = debit;
          prec.totalCredit = credit;
          controlesParCompte.set(compteCourant, prec);
          nbTotaux++;
        }
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

      // Sous-total periodique / total mois / total general / total classe - et par extension
      // TOUTE ligne commencant par "Total" non capturee ci-dessus : jamais une ecriture (une
      // ecriture commence par une date ou un code journal), simplement exclue.
      if (contient(texteFold, MC_REPORT) || texteFold.startsWith("total")) {
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

  return {
    lignes,
    controles: [...controlesParCompte.values()],
    notes,
    intitules: Object.fromEntries(intitulesParCompte),
  };
}
