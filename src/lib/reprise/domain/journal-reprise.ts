// Domaine PUR : le JOURNAL (ledger eStale) des ecritures reprises - decision Sekou
// 2026-08-18. L'exercice 2026 n'est PAS un exercice de reprise : REAL 31 le cloturera et le
// presentera a l'AG. Les mouvements de janvier a mai sont de vraies charges/encaissements
// 2026 -> ils gardent leur NATURE (bank/purchase/fundraising), seuls les a-nouveaux
// d'ouverture partent en carryforward. Tout marquer carryforward donnerait des journaux ou
// l'exercice semble commencer a la bascule.
//
// Le GL Matera n'imprime PAS de colonne journal : la nature se DERIVE de la CONTREPARTIE
// (toujours imprimee chez Matera). C'est mecanique mais c'est une INFERENCE -> regle
// conservatrice : seuls les cas qui TRANCHENT derivent, tout le reste rend null et
// l'appelant replie sur carryforward avec une note VISIBLE (meme discipline que le
// fallback OCR). "Degrade mais jamais faux" (Sekou).
//
// Sonde SE999 2026-08-18 : BANK / PURCHASE / SALE / FUNDRAISING tous ACCEPTES par
// createEntryExpert (crees a 0,01 puis supprimes) - l'enum n'est pas restreint a
// carryforward, la derivation a donc un sens.

/** Journaux eStale (EntryLedger), en minuscules cote domaine. */
export type JournalEcriture =
  | "general"
  | "carryforward"
  | "purchase"
  | "bank"
  | "sale"
  | "fundraising"
  | "closing"
  | "distribution";

/** Racine chiffree d'un compte source ("4501.100" -> "4501"). */
function racine(compte: string): string {
  return (compte.split(".")[0] ?? compte).replace(/[^0-9]/g, "");
}

/** Compte de tresorerie (banque 512/514, valeurs a l'encaissement 511, caisse 53x). */
function estTresorerie(r: string): boolean {
  return r.startsWith("51") || r.startsWith("53");
}

/**
 * Derive le journal d'une ecriture du couple (compte, contrepartie). null = la contrepartie
 * est absente ou ne tranche pas -> l'appelant replie sur carryforward, VISIBLEMENT.
 *
 * Regles (dans cet ordre - la tresorerie prime, un reglement fournisseur passe en banque) :
 *   - un des deux cotes est un compte de tresorerie          -> "bank"
 *   - fournisseur (401/408) contre une charge (classe 6)     -> "purchase"
 *   - coproprietaire (450) contre un produit d'appel (70x)
 *     ou un fonds travaux (105)                              -> "fundraising"
 */
export function deriverJournal(compte: string, contrepartie?: string): JournalEcriture | null {
  if (!contrepartie) return null;
  const c = racine(compte);
  const k = racine(contrepartie);
  if (!c || !k) return null;

  if (estTresorerie(c) || estTresorerie(k)) return "bank";

  const fournisseurCharge =
    (c.startsWith("401") || c.startsWith("408")) && k.startsWith("6");
  const chargeFournisseur =
    c.startsWith("6") && (k.startsWith("401") || k.startsWith("408"));
  if (fournisseurCharge || chargeFournisseur) return "purchase";

  const coproAppel =
    c.startsWith("450") && (k.startsWith("70") || k.startsWith("105"));
  const appelCopro =
    (c.startsWith("70") || c.startsWith("105")) && k.startsWith("450");
  if (coproAppel || appelCopro) return "fundraising";

  return null;
}
