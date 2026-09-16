// LE formateur d'euros de l'intranet. Huit versions locales coexistaient (audit du
// 16/09/2026), dont une qui rendait « 1 234567,50 € » au-dela du million. Tout passe par
// Intl : separateur de milliers et symbole colles par une espace insecable (le montant ne
// se coupe jamais en fin de ligne, y compris sur le PDF Pennylane).

type Decimales = 2 | 0 | "auto";

const FORMATS: Record<string, Intl.NumberFormat> = {
  2: new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }),
  0: new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  auto: new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 }),
};

/**
 * 1234.5 -> « 1 234,50 € ». `decimales` : 2 (defaut, montants factures), 0 (ordres de
 * grandeur), "auto" (0 a 2, pour une saisie qu'on reflete telle quelle).
 */
export function formatEuros(montant: number, options?: { decimales?: Decimales }): string {
  const format = FORMATS[String(options?.decimales ?? 2)] ?? FORMATS[2];
  // Intl separe les milliers par une espace fine (U+202F) : on la ramene a l'insecable
  // classique, que toutes les polices et Pennylane rendent correctement.
  return format.format(montant).replace(/ /g, " ");
}
