// PARSEUR DETERMINISTE d'une BALANCE COMPTABLE (couche texte positionnee). PUR, zero
// reseau. C'est la piece qui rend la preuve de bascule EXTRAITE et non declaree : la regle
// Sekou 2026-08-18 degrade le blocage avant-repartition seulement si une balance
// independante est FOURNIE et que l'extraction du grand livre la reproduit au centime.
//
// Structure mesuree (Matera S0303, "Balance comptable au 06 mai 2026") :
//   Numero | Nom du compte | Debit | Credit          <- en-tetes imprimes (ancres x)
//   1        Provisions, avances...          2 805,14 <- ligne d'AGREGAT (1-2 chiffres) : ecartee
//   1031001  Avances de tresorerie           1 219,59 <- ligne FEUILLE (>= 3 chiffres) : un solde
// La date de bascule est lue du TITRE ("au 06 mai 2026") via extraireDate.
//
// Meme discipline que les autres parseurs : rien de code en dur, ancrage par en-tetes,
// faux gras dedoublonne, pied de page ecarte, echec VISIBLE (zero solde => note explicite).

import { parseNombreFr } from "@/lib/reprise/adapters/shared/parseur-grand-livre";
import type { PageTexte } from "@/lib/reprise/adapters/shared/pdf-texte";
import {
  dedoublonnerItems,
  extraireDate,
  plier,
  tokensFold,
} from "@/lib/reprise/adapters/shared/texte-positions";
import { classeDe, type SoldeCompte } from "@/lib/reprise/domain/compta";

const RE_PIED_DE_PAGE = /^page\s+\d+\s+sur\s+\d+$/;
/** Numero de compte FEUILLE (>= 3 chiffres). 1-2 chiffres = agregat de classe/section. */
const RE_COMPTE_FEUILLE = /^[1-9]\d{2,}(?:\.\d+)?$/;
const RE_AGREGAT = /^[1-9]\d?$/;

export interface ResultatParsageBalance {
  /** Soldes des comptes FEUILLE (debit XOR credit selon la colonne du montant). */
  soldes: SoldeCompte[];
  /** Date de bascule lue du titre (JJ/MM/AAAA), si presente. */
  dateBascule?: string;
  /** Notes de diagnostic PII-free. */
  notes: string[];
}

export function parserBalance(pages: PageTexte[]): ResultatParsageBalance {
  const soldes: SoldeCompte[] = [];
  const notes: string[] = [];
  let dateBascule: string | undefined;
  let debitX: number | null = null;
  let creditX: number | null = null;
  let montantMinX = Number.POSITIVE_INFINITY;
  let agregatsEcartes = 0;
  let horsClasse = 0;
  let doublesRetires = 0;

  for (const page of pages) {
    for (const ligne of page.lignes) {
      const dedouble = dedoublonnerItems(ligne.items);
      doublesRetires += dedouble.retires;
      const items = dedouble.items;
      const texteComplet = items.map((i) => i.chaine).join(" ").replace(/\s+/g, " ").trim();
      const fold = plier(texteComplet);
      if (RE_PIED_DE_PAGE.test(fold)) continue;

      // Titre "Balance comptable au 06 mai 2026" -> la date de bascule.
      if (!dateBascule && fold.startsWith("balance")) {
        const d = extraireDate(texteComplet);
        if (d) dateBascule = d;
        continue;
      }

      // En-tete de colonnes : ancres Debit / Credit (tokens exacts, lecon "Creditor Name").
      const tokens = new Set(tokensFold(texteComplet));
      if (tokens.has("debit") && tokens.has("credit")) {
        for (const it of items) {
          const t = new Set(tokensFold(it.chaine));
          const centre = it.x + it.largeur / 2;
          if (t.has("debit")) debitX = centre;
          else if (t.has("credit")) creditX = centre;
        }
        if (debitX !== null && creditX !== null) {
          montantMinX = Math.min(debitX, creditX) - 20;
        }
        continue;
      }
      if (debitX === null || creditX === null) continue;

      const itemsTexte = items.filter((i) => i.x + i.largeur / 2 < montantMinX);
      const premier = (itemsTexte[0]?.chaine ?? "").trim();

      if (RE_AGREGAT.test(premier)) {
        agregatsEcartes++;
        continue;
      }
      if (!RE_COMPTE_FEUILLE.test(premier)) continue;

      // Solde : l'unique montant de la ligne, rattache a l'ancre la plus proche.
      let debit = 0;
      let credit = 0;
      for (const it of items) {
        const centre = it.x + it.largeur / 2;
        if (centre < montantMinX) continue;
        const n = parseNombreFr(it.chaine);
        if (n === null) continue;
        if (Math.abs(centre - debitX) <= Math.abs(centre - creditX)) debit += n;
        else credit += n;
      }

      let classe: SoldeCompte["classe"];
      try {
        classe = classeDe(premier);
      } catch {
        horsClasse++;
        continue;
      }
      const libelle = itemsTexte
        .slice(1)
        .map((i) => i.chaine)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      soldes.push({
        nomenclature: premier,
        ...(libelle ? { libelle } : {}),
        classe,
        debit,
        credit,
        solde: Math.round((debit - credit) * 100) / 100,
      });
    }
  }

  notes.push(
    `Parseur balance : ${pages.length} page(s), ${soldes.length} compte(s) feuille, ${agregatsEcartes} agregat(s) ecarte(s)${dateBascule ? `, date de bascule ${dateBascule}` : ""}.`,
  );
  if (doublesRetires) notes.push(`Parseur balance : ${doublesRetires} item(s) en double retire(s) (faux gras).`);
  if (horsClasse) notes.push(`Parseur balance : ${horsClasse} compte(s) hors classes 1-7 ecarte(s).`);
  if (soldes.length === 0) {
    notes.push(
      "Parseur balance : AUCUN solde extrait - le document n'est pas une balance reconnue (en-tetes Numero/Debit/Credit introuvables).",
    );
  }
  return { soldes, ...(dateBascule ? { dateBascule } : {}), notes };
}
