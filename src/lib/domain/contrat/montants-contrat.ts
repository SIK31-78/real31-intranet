// Montants du contrat de syndic : la conversion TTC -> HT.
// Portage de l'Office Script `ContratReplace` (MYTHEC). Pur, deterministe.
//
// CONVENTION TTC (tranchee le 2026-07-06, confirmee par Sekou et par le script) :
// la table `intranet_tarifs` contient du TTC. Le contrat affiche les DEUX valeurs
// pour chaque prestation : le TTC brut (placeholder `[Tarifs.Tarif.Xxx]`) et le HT
// (`[XxxHT]`), obtenu par division par 1,2.
//
// On rend des CHAINES a deux decimales, comme le legacy (`.toFixed(2)`) : l'arrondi
// doit tomber sur les memes centimes que les contrats deja signes. La mise en forme
// francaise (virgule, espaces, symbole) est un choix d'AFFICHAGE, elle se fait dans
// le composant avec `formatEuros` de services/facturation/format.ts - on ne cree pas
// un troisieme formateur dans le projet.

/** Taux de TVA applique aux honoraires et prestations du cabinet. */
export const TAUX_TVA = 1.2;

/** TTC -> HT, deux decimales, format brut : 163.65 -> "136.38". */
export function htDepuisTtc(montantTtc: number): string {
  return (montantTtc / TAUX_TVA).toFixed(2);
}

/** TTC tel quel, deux decimales, format brut : 163.65 -> "163.65". */
export function ttcBrut(montantTtc: number): string {
  return montantTtc.toFixed(2);
}
