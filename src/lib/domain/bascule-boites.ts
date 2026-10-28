// Bascule d'un mail d'une boîte triée à une autre (ADR-050, décision Sekou du 28/10/2026).
// Des mails arrivent dans la mauvaise boîte partagée (dans syndic4 un mail pour une copro LGC,
// ou l'inverse). Graph ne sait pas déplacer un message d'une boîte à l'autre : le mail est
// RECOPIÉ À L'IDENTIQUE dans la réception de la boîte cible, puis l'original part aux
// éléments supprimés de la boîte de départ, et le geste est inscrit au journal du tri de la
// boîte de départ. Ici, les règles pures : la clé de journal, qui peut basculer, et ce qu'est
// une copie complète. Domaine pur : ni Graph, ni auth.

/** Préfixe de la clé de dossier d'une ligne de bascule : « bascule:syndic2@real31.fr ». */
export const PREFIXE_BASCULE = "bascule:";

/** La clé de journal d'une bascule vers cette boîte. */
export function cleBascule(cible: string): string {
  return `${PREFIXE_BASCULE}${cible.trim().toLowerCase()}`;
}

/** La boîte cible d'une clé de bascule, ou null si la clé n'en est pas une. */
export function boiteDeBascule(cle: string | null | undefined): string | null {
  if (!cle?.startsWith(PREFIXE_BASCULE)) return null;
  const boite = cle.slice(PREFIXE_BASCULE.length);
  return boite || null;
}

/** La ligne de journal est-elle une bascule (pas un rangement) ? */
export function estBascule(e: { dossierCle: string | null }): boolean {
  return boiteDeBascule(e.dossierCle) !== null;
}

/** Ce qu'on lit dans le journal, colonne « Rangé dans ». */
export function nomBascule(cible: string): string {
  return `Basculé vers ${cible.trim().toLowerCase()}`;
}

/** Ce que l'appelant sait des deux boîtes (config et interrupteurs déjà résolus). */
export interface EtatBascule {
  source: string | null;
  cible: string | null;
  /** La cible est-elle une boîte triée de la config ? */
  cibleConfiguree: boolean;
  /** Le tri écrit-il pour de vrai dans chaque boîte (ecritureTriPour) ? */
  ecritureSource: boolean;
  ecritureCible: boolean;
  /** MAIL_SOURCE=graph : le vrai Graph est branché. */
  graph: boolean;
}

/**
 * Pourquoi la bascule est refusée, en clair ; null si elle est permise. Elle écrit dans DEUX
 * boîtes (la copie dans la cible, l'original aux éléments supprimés de la source) : l'écriture
 * doit être ouverte sur les deux, et Graph branché. Il n'y a pas de bascule « simulée » : une
 * copie simulée n'aurait aucun sens dans l'autre boîte, on refuse plutôt que de faire semblant.
 */
export function refusBascule(e: EtatBascule): string | null {
  if (!e.source) return "Ce mail n'est pas dans une boîte triée.";
  if (!e.cible || !e.cibleConfiguree) return "La boîte de destination n'est pas une boîte triée de l'intranet.";
  if (e.source === e.cible) return "Ce mail est déjà dans cette boîte.";
  if (!e.graph) return "La bascule entre boîtes n'est possible qu'avec les vraies boîtes (MAIL_SOURCE=graph) : rien n'a été fait.";
  const fermees = [e.ecritureSource ? null : e.source, e.ecritureCible ? null : e.cible].filter(Boolean);
  if (fermees.length) {
    return `L'écriture du tri est coupée sur ${fermees.join(" et ")} : la bascule entre boîtes est impossible (rien n'a été fait).`;
  }
  return null;
}

/** Une pièce jointe telle que la comparaison des deux boîtes la voit. */
export interface PieceComparee {
  nom: string;
  isInline: boolean;
}

/**
 * La copie a-t-elle toutes les pièces de l'original ? On compare des noms (et le caractère
 * « en ligne »), pas des tailles : Graph donne pour une même pièce une `size` qui varie de
 * quelques centaines à 25 000 octets selon la boîte (mesure du 27/10/2026). Une copie
 * interrompue au milieu de ses pièces n'est jamais prise pour complète : elle est refaite.
 */
export function memesPieces(original: PieceComparee[], copie: PieceComparee[]): boolean {
  if (original.length !== copie.length) return false;
  const cle = (p: PieceComparee) => `${p.isInline ? "i" : "f"}|${p.nom}`;
  const reste = new Map<string, number>();
  for (const p of copie) reste.set(cle(p), (reste.get(cle(p)) ?? 0) + 1);
  for (const p of original) {
    const n = reste.get(cle(p)) ?? 0;
    if (n === 0) return false;
    reste.set(cle(p), n - 1);
  }
  return true;
}
