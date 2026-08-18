// Aides PARTAGEES des parseurs positionnes (grand livre, RGD, appels de fonds) : pliage de
// texte, tokens exacts, dates FR (numeriques et en toutes lettres), dedoublonnage du faux
// gras. Extraites du parseur grand livre le 2026-08-18 quand les blocs B et C ont eu besoin
// des memes armes contre les memes pieges Matera - une seule copie, jamais deux qui divergent.
// PUR : aucune I/O.

import type { ItemTexte } from "@/lib/reprise/adapters/shared/pdf-texte";

/** Mois francais -> numero (extraction des dates en toutes lettres, ex. "01 janvier 2026"). */
export const MOIS_FR: Record<string, string> = {
  janvier: "01", fevrier: "02", mars: "03", avril: "04", mai: "05", juin: "06",
  juillet: "07", aout: "08", septembre: "09", octobre: "10", novembre: "11", decembre: "12",
};

/** Minuscule + sans accents : matching robuste des en-tetes et mots-cles. */
export function plier(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Tokens plies d'un texte (mots alphanumeriques). Le matching des EN-TETES de colonnes se
 * fait sur des TOKENS EXACTS, jamais par sous-chaine : les libelles de virement SEPA
 * impriment "Creditor Name" et `includes("credit")` faisait voler l'ancre Credit par un
 * libelle de la fenetre (mesure page 14 du GL Matera S0303 : creditX detecte a x=329, en
 * pleine colonne Libelle -> tous les credits reels ecartes comme "solde").
 */
export function tokensFold(texte: string): string[] {
  return plier(texte)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/**
 * Extrait une date de la portion texte d'une ligne, en JJ/MM/AAAA. Deux formes rencontrees
 * en reel : numerique ("24/10/2025", S0302) et en toutes lettres ("01 janvier 2026", Matera
 * S0303 - normalisee en JJ/MM/AAAA pour que l'aval n'ait qu'un format a connaitre).
 *
 * C'est la POSITION qui departage, jamais le format : la date de l'ecriture ouvre la ligne
 * (1re colonne), alors qu'un LIBELLE peut contenir une date parasite ("Estimation du
 * 11/07/24" - mesure sur la ligne Veolia du GL S0303, qui ressortait datee 2024 et faisait
 * echouer le prerequis d'exercices). Prendre "le numerique d'abord" laissait le libelle
 * battre la vraie date en toutes lettres.
 */
export function extraireDate(texte: string): string {
  const fold = plier(texte);
  const num = fold.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  const lettres = fold.match(/(\d{1,2})(?:er)?\s+([a-z]+)\s+(\d{4})/);
  const moisLettres = lettres ? MOIS_FR[lettres[2]!] : undefined;

  const posNum = num?.index ?? Number.POSITIVE_INFINITY;
  const posLettres = lettres && moisLettres ? lettres.index! : Number.POSITIVE_INFINITY;

  if (posLettres < posNum) {
    return `${lettres![1]!.padStart(2, "0")}/${moisLettres}/${lettres![3]}`;
  }
  return num ? num[0] : "";
}

/**
 * Retire les items DESSINES DEUX FOIS (faux gras : la meme chaine tracee deux fois au meme
 * endroit - mesure sur les titres Matera, "1031001 - Avances..." present en double). Sans ce
 * dedoublonnage, l'intitule capture serait duplique et un MONTANT double serait ADDITIONNE
 * par classerMontants. On n'ecarte que le double STRICT (meme chaine, quasi meme x) : deux
 * montants egaux dans deux colonnes distinctes ont des x eloignes et sont conserves.
 */
export function dedoublonnerItems(items: ItemTexte[]): { items: ItemTexte[]; retires: number } {
  const gardes: ItemTexte[] = [];
  let retires = 0;
  for (const it of items) {
    const double = gardes.some((g) => g.chaine === it.chaine && Math.abs(g.x - it.x) < 1);
    if (double) retires++;
    else gardes.push(it);
  }
  return { items: gardes, retires };
}
