// Domaine PUR des ajouts libres de l'ODJ : champs libres (libelle + valeur, dans
// une section) et paragraphes libres (texte, en fin de document). Persistes dans
// la table d'etat EXISTANTE (intranet_odj_champs, cle/valeur) - zero SQL a passer,
// meme parti que la cloture (CLE_CLOTURE_ODJ) et les points (PREFIXE_POINT).
//
// Encodage (volontairement trivial, comme formatCloture) :
//   champ libre : champId "libre.<sectionId>.<horodatage>", valeur "<libelle>|<texte>"
//                 (premier "|" = separateur ; un "|" dans le texte est conserve)
//   paragraphe  : champId "bloc.<horodatage>",              valeur = le texte brut
// Suppression = setChamp(null) (valeur vide) : la ligne d'etat disparait.

import type { ChampOdj } from "@/lib/domain/odj";

/** Ligne d'etat cle/valeur, STRUCTURELLE (compatible EtatChampOdj du port, sans
 *  l'importer : le domaine ne depend pas des ports - regle boundaries/ADR-001). */
interface LigneEtat {
  champId: string;
  valeur: string | null;
}

export const PREFIXE_LIBRE = "libre.";
export const PREFIXE_BLOC = "bloc.";

export interface BlocLibre {
  /** champId complet ("bloc.<horodatage>"), cle de persistance. */
  id: string;
  texte: string;
}

export function estChampLibre(champId: string): boolean {
  return champId.startsWith(PREFIXE_LIBRE);
}

export function estBlocLibre(champId: string): boolean {
  return champId.startsWith(PREFIXE_BLOC);
}

/** Champ libre OU paragraphe : ce qui a ete AJOUTE (donc supprimable) par opposition
 *  aux champs du squelette, qui se vident mais ne disparaissent jamais. */
export function estAjoutLibre(champId: string): boolean {
  return estChampLibre(champId) || estBlocLibre(champId);
}

/** "<libelle>|<texte>" -> { libelle, texte }. Sans "|", tout est libelle (saisie partielle). */
export function parseChampLibre(valeur: string): { libelle: string; texte: string } {
  const i = valeur.indexOf("|");
  if (i < 0) return { libelle: valeur.trim(), texte: "" };
  return { libelle: valeur.slice(0, i).trim(), texte: valeur.slice(i + 1).trim() };
}

/** Inverse de parseChampLibre. Le "|" est retire du LIBELLE (il est structurel),
 *  conserve dans le texte. */
export function serialiserChampLibre(libelle: string, texte: string): string {
  return `${libelle.replaceAll("|", "/").trim()}|${texte.trim()}`;
}

/** Id STABLE d'un nouvel ajout : l'horodatage du clic. Stable = la cle de persistance
 *  ne change jamais apres creation (l'ordre d'affichage en decoule aussi). */
export function idChampLibre(sectionId: string, maintenantMs: number): string {
  return `${PREFIXE_LIBRE}${sectionId}.${maintenantMs}`;
}

export function idBlocLibre(maintenantMs: number): string {
  return `${PREFIXE_BLOC}${maintenantMs}`;
}

/** Section d'un champ libre ("libre.verif-comptes.1725..." -> "verif-comptes"). */
export function sectionDuChampLibre(champId: string): string | undefined {
  if (!estChampLibre(champId)) return undefined;
  const reste = champId.slice(PREFIXE_LIBRE.length);
  const i = reste.lastIndexOf(".");
  return i > 0 ? reste.slice(0, i) : undefined;
}

/** Les champs libres d'une section, en ChampOdj editables (source manuel, marques
 *  `libre`), tries par ordre de creation (l'horodatage dans l'id). */
export function champsLibresDeSection(etat: LigneEtat[], sectionId: string): ChampOdj[] {
  return etat
    .filter((e) => e.valeur && sectionDuChampLibre(e.champId) === sectionId)
    .sort((a, b) => a.champId.localeCompare(b.champId))
    .map((e) => {
      const { libelle, texte } = parseChampLibre(e.valeur ?? "");
      return {
        id: e.champId,
        libelle: libelle || "Nouveau champ",
        source: "manuel" as const,
        editable: true,
        saisi: true,
        libre: true,
        ...(texte ? { valeur: texte } : {}),
      };
    });
}

/** Les paragraphes libres du document, tries par ordre de creation. */
export function blocsLibres(etat: LigneEtat[]): BlocLibre[] {
  return etat
    .filter((e) => e.valeur && estBlocLibre(e.champId))
    .sort((a, b) => a.champId.localeCompare(b.champId))
    .map((e) => ({ id: e.champId, texte: e.valeur ?? "" }));
}
