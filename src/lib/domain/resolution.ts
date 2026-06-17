// Domaine d'une resolution d'AG ("motion" cote eStale). Source = la motion bank
// eStale (ADR-024) : l'intranet ne stocke pas de resolutions, il les lit. Types purs.

export type MajoriteResolution =
  | "A24"
  | "A25"
  | "A25_1"
  | "A26"
  | "A26_1"
  | "UNANIMITY"
  | "QUESTION";

export interface Resolution {
  id: string;
  titre: string;
  /** Corps en texte simple (HTML eStale nettoye), pour apercu. */
  corps: string;
  majorite: MajoriteResolution;
  motsCles: string[];
  /** Resolution standard fournie par defaut (vs ajoutee par le cabinet). */
  parDefaut: boolean;
  /** Rang hierarchique dans la bank ("1", "78", "78.1"...) : encode les groupes. */
  rank: string;
  /** En-tete de groupe (type eStale "group") : regroupe des sous-resolutions. */
  estGroupe?: boolean;
}

/** Rang parent d'un rang hierarchique ("78.1" -> "78"), ou null si rang de tete. */
export function rangParent(rank: string): string | null {
  const i = rank.lastIndexOf(".");
  return i < 0 ? null : rank.slice(0, i);
}

/** Libelle court de la majorite (art. de la loi du 10 juillet 1965). */
export const MAJORITE_LABEL: Record<MajoriteResolution, string> = {
  A24: "Art. 24",
  A25: "Art. 25",
  A25_1: "Art. 25-1",
  A26: "Art. 26",
  A26_1: "Art. 26-1",
  UNANIMITY: "Unanimité",
  QUESTION: "Sans vote",
};

/** Ordre d'affichage : majorites de vote croissantes, "sans vote" en dernier. */
export const MAJORITE_ORDRE: MajoriteResolution[] = [
  "A24",
  "A25",
  "A25_1",
  "A26",
  "A26_1",
  "UNANIMITY",
  "QUESTION",
];

/** Nettoie le HTML d'eStale en texte simple pour un apercu lisible. */
export function texteSimple(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}
