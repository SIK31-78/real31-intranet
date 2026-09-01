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
/** "masque.<champId>" = "1" : le gestionnaire a RETIRE ce champ standard du document
 *  (le squelette le refera toujours naitre ; seul cet etat le masque). */
export const PREFIXE_MASQUE = "masque.";
/** "libelle.<champId>" : libelle REECRIT par le gestionnaire (prime sur le catalogue). */
export const PREFIXE_LIBELLE = "libelle.";
/** "titre-section.<sectionId>" : titre de section reecrit. */
export const PREFIXE_TITRE_SECTION = "titre-section.";
/** "note.<champId>.<horodatage>" : paragraphe ANCRE sous une ligne precise (le besoin
 *  reel du gestionnaire : expliquer le trop-percu JUSTE sous sa ligne - un paragraphe
 *  de fin de section "va tout en bas donc ne sert a rien", retour 2026-09-01). */
export const PREFIXE_NOTE = "note.";

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
  return estChampLibre(champId) || estBlocLibre(champId) || estNote(champId);
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

/** Section d'un bloc ("bloc.gestion-courante.1725..." -> "gestion-courante").
 *  Les blocs historiques "bloc.<ts>" (sans section) n'en ont pas -> fin de document. */
export function sectionDuBloc(champId: string): string | undefined {
  if (!estBlocLibre(champId)) return undefined;
  const reste = champId.slice(PREFIXE_BLOC.length);
  const i = reste.lastIndexOf(".");
  return i > 0 ? reste.slice(0, i) : undefined;
}

export function idBlocDeSection(sectionId: string, maintenantMs: number): string {
  return `${PREFIXE_BLOC}${sectionId}.${maintenantMs}`;
}

/** Les paragraphes libres D'UNE SECTION, tries par ordre de creation. */
export function blocsLibresDeSection(etat: LigneEtat[], sectionId: string): BlocLibre[] {
  return etat
    .filter((e) => e.valeur && sectionDuBloc(e.champId) === sectionId)
    .sort((a, b) => a.champId.localeCompare(b.champId))
    .map((e) => ({ id: e.champId, texte: e.valeur ?? "" }));
}

/** Les paragraphes libres de FIN DE DOCUMENT (blocs sans section, tries par creation).
 *  `sectionsConnues` protege les blocs historiques : un id "bloc.<ts>" n'a pas de
 *  section, mais "bloc.xyz.<ts>" dont xyz n'est PAS une section connue ne doit pas
 *  disparaitre pour autant - il retombe en fin de document. */
export function blocsLibres(etat: LigneEtat[], sectionsConnues?: ReadonlySet<string>): BlocLibre[] {
  return etat
    .filter((e) => {
      if (!e.valeur || !estBlocLibre(e.champId)) return false;
      const s = sectionDuBloc(e.champId);
      return s === undefined || !(sectionsConnues?.has(s) ?? false);
    })
    .sort((a, b) => a.champId.localeCompare(b.champId))
    .map((e) => ({ id: e.champId, texte: e.valeur ?? "" }));
}

export function estNote(champId: string): boolean {
  return champId.startsWith(PREFIXE_NOTE);
}

export function idNote(champAncre: string, maintenantMs: number): string {
  return `${PREFIXE_NOTE}${champAncre}.${maintenantMs}`;
}

/** Ligne d'ancrage d'une note ("note.comptes.ecart-budget.1725..." -> "comptes.ecart-budget").
 *  L'horodatage est TOUJOURS le dernier segment ; l'ancre peut elle-meme porter des points. */
export function ancreDeNote(champId: string): string | undefined {
  if (!estNote(champId)) return undefined;
  const reste = champId.slice(PREFIXE_NOTE.length);
  const i = reste.lastIndexOf(".");
  return i > 0 ? reste.slice(0, i) : undefined;
}

/** Les notes ancrees sous UNE ligne, triees par ordre de creation. */
export function notesDeLigne(etat: LigneEtat[], champAncre: string): BlocLibre[] {
  return etat
    .filter((e) => e.valeur && ancreDeNote(e.champId) === champAncre)
    .sort((a, b) => a.champId.localeCompare(b.champId))
    .map((e) => ({ id: e.champId, texte: e.valeur ?? "" }));
}

/** Champs standards MASQUES par le gestionnaire (ids des champs, sans le prefixe). */
export function champsMasques(etat: LigneEtat[]): Set<string> {
  return new Set(
    etat
      .filter((e) => e.valeur && e.champId.startsWith(PREFIXE_MASQUE))
      .map((e) => e.champId.slice(PREFIXE_MASQUE.length)),
  );
}

/** Libelles reecrits par le gestionnaire : champId -> nouveau libelle. */
export function libellesReecrits(etat: LigneEtat[]): Map<string, string> {
  return new Map(
    etat
      .filter((e) => e.valeur && e.champId.startsWith(PREFIXE_LIBELLE))
      .map((e) => [e.champId.slice(PREFIXE_LIBELLE.length), (e.valeur ?? "").trim()]),
  );
}

/** Titres de section reecrits : sectionId -> nouveau titre. */
export function titresSectionsReecrits(etat: LigneEtat[]): Map<string, string> {
  return new Map(
    etat
      .filter((e) => e.valeur && e.champId.startsWith(PREFIXE_TITRE_SECTION))
      .map((e) => [e.champId.slice(PREFIXE_TITRE_SECTION.length), (e.valeur ?? "").trim()]),
  );
}
