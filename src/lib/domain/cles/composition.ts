// La composition d'un trousseau, lue par un humain : son texte et sa valeur. Pur.

import { LIBELLE_TYPE_ELEMENT, type ElementComposition } from "./types";

/** « 1 250 € », « 12,50 € ». */
export function euros(n: number): string {
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
}

/** La valeur totale en euros, ou null si aucun element n'est valorise (le cas de LGC). */
export function valeurComposition(c: readonly ElementComposition[]): number | null {
  const valorises = c.filter((e) => typeof e.valeurUnitaire === "number");
  if (valorises.length === 0) return null;
  return Math.round(valorises.reduce((s, e) => s + e.quantite * (e.valeurUnitaire ?? 0), 0) * 100) / 100;
}

/** « 3 clés (porte hall), 1 badge » ; avec la valeur unitaire quand on la demande et qu'elle est connue. */
export function texteComposition(c: readonly ElementComposition[], avecValeur = false): string {
  return c
    .map((e) => {
      const base = `${e.quantite} ${LIBELLE_TYPE_ELEMENT[e.type]}${e.quantite > 1 ? "s" : ""}${e.libelle ? ` (${e.libelle})` : ""}`;
      return avecValeur && typeof e.valeurUnitaire === "number" ? `${base} à ${euros(e.valeurUnitaire)}` : base;
    })
    .join(", ");
}
