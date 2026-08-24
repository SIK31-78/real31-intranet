// Service de reprise comptable - INCREMENT 1 : extraction du grand livre + BALANCE offline.
//
// Ne fait AUCUNE ecriture, AUCUN appel eStale (ca viendra aux increments 3+). Il se contente,
// a partir d'un provider d'extraction (injecte, jamais choisi ici : l'appelant passe par le
// router) :
//   1. d'extraire toutes les ecritures du grand livre ;
//   2. de calculer la BALANCE par classe (filet de verification) ;
//   3. de verifier l'EQUILIBRE GLOBAL - auto-check FORT : un grand livre complet doit avoir
//      total debit == total credit ; un desequilibre signale une extraction incomplete
//      (reports/totaux mal exclus, lignes manquantes) ;
//   4. d'exposer le sous-ensemble BLOC A (classes 4 et 5) que l'increment 3 importera en
//      premier dans eStale (comptes de tiers + tresorerie).
// Les notes de vigilance (lignes exclues par le normaliseur, comptes hors 1-7, desequilibre)
// sont consolidees pour l'humain qui decidera GO/STOP plus tard.

import type { DocumentSource } from "@/lib/reprise/ports/document-source";
import type { ExtractionComptaProvider } from "@/lib/reprise/ports/extraction-compta-provider";
import {
  balanceDesEcritures,
  verifierEquilibreGrandLivre,
  type JeuEcritures,
  type LigneEcriture,
} from "@/lib/reprise/domain/ecriture";
import type { BalanceReprise } from "@/lib/reprise/domain/compta";

export interface ResultatRepriseCompta {
  /** Ecritures extraites + notes de vigilance (dont le desequilibre eventuel). */
  jeu: JeuEcritures;
  /** Balance par classe + totaux (le filet de verification offline). */
  balance: BalanceReprise;
  /** Verdict d'equilibre GLOBAL du grand livre (auto-check fort). */
  equilibreGlobal: { equilibre: boolean; ecart: number };
  /** Sous-ensemble BLOC A = classes 4 (tiers) et 5 (tresorerie) - futur import eStale. */
  blocA: LigneEcriture[];
}

export async function extraireEtVerifierGrandLivre(
  provider: ExtractionComptaProvider,
  docs: DocumentSource[],
): Promise<ResultatRepriseCompta> {
  const jeu = await provider.extraireGrandLivre(docs);

  const balance = balanceDesEcritures(jeu.lignes);
  const equilibre = verifierEquilibreGrandLivre(jeu.lignes);
  const blocA = jeu.lignes.filter((l) => l.classe === 4 || l.classe === 5);

  // Note de vigilance FORTE si le grand livre complet ne s'equilibre pas : c'est le signal
  // qu'il manque des ecritures ou que des reports/totaux ont ete repris a tort (double compte).
  if (!equilibre.equilibre) {
    jeu.notes.push(
      `Grand livre DESEQUILIBRE : ecart ${equilibre.ecart} (total debit != total credit). Un grand livre complet doit etre equilibre -> verifier les exclusions (reports a nouveau, sous-totaux, totaux) ou des ecritures manquantes avant tout import.`,
    );
  }

  return {
    jeu,
    balance,
    equilibreGlobal: { equilibre: equilibre.equilibre, ecart: equilibre.ecart },
    blocA,
  };
}
