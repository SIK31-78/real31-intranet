// Regroupement des mails en affaires (porte depuis assistant-ia) : fil par objet
// normalise + fusion des fils partageant un identifiant fort. Fonction pure.

import type { RawMail } from "./raw-mail";
import { cleanBody } from "./clean";

/** Objet normalise (sans Re/Tr/Fwd, casse/espaces) = cle de fil. */
export function normSubject(s: string): string {
  return (s || "")
    .replace(/^(\s*(re|ré|rép|tr|fw|fwd)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Identifiants d'affaire a FORTE specificite (un meme n° relie des fils d'objets
// differents). Eviter les motifs generiques (n° de place de parking -> fusions
// parasites).
const ID_PATTERNS: RegExp[] = [
  /\b(\d{12,})\b/g,
  /ticket\s*n[°ºo]?\s*(\d{3,})/gi,
  /\bod[sr]\s*n[°ºo]?\s*(\d{3,})/gi,
  /\b(?:r[ée]f|dossier)\s*[:.]?\s*([a-z]{1,3}[\/-]\d{4,})/gi,
];

export function extractRefs(text: string): Set<string> {
  const refs = new Set<string>();
  for (const re of ID_PATTERNS) {
    for (const m of text.matchAll(re)) if (m[1]) refs.add(m[1].toLowerCase());
  }
  return refs;
}

export interface Affaire {
  copro: string;
  /** Objet du dernier mail. */
  label: string;
  mails: RawMail[];
  refs: string[];
  first: string;
  last: string;
}

/** Union-Find pour fusionner les fils relies par un identifiant commun. */
class UnionFind {
  private p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    let r = x;
    while (this.p[r] !== r) r = this.p[r]!;
    this.p[x] = r;
    return r;
  }
  union(a: number, b: number): void {
    this.p[this.find(a)] = this.find(b);
  }
}

/** Regroupe une liste de mails (d'UNE copro idealement) en affaires. */
export function groupAffaires(mails: RawMail[]): Affaire[] {
  const byThread = new Map<string, RawMail[]>();
  for (const m of mails) {
    const k = normSubject(m.subject) || `__solo_${m.id}`;
    (byThread.get(k) ?? byThread.set(k, []).get(k)!).push(m);
  }
  const threads = [...byThread.values()];

  const threadRefs = threads.map((t) => {
    const refs = new Set<string>();
    for (const m of t) for (const r of extractRefs(`${m.subject} ${cleanBody(m)}`)) refs.add(r);
    return refs;
  });

  const uf = new UnionFind(threads.length);
  const owner = new Map<string, number>();
  threadRefs.forEach((refs, i) => {
    for (const r of refs) {
      const prev = owner.get(r);
      if (prev !== undefined) uf.union(i, prev);
      else owner.set(r, i);
    }
  });

  const groups = new Map<number, number[]>();
  threads.forEach((_, i) => {
    const root = uf.find(i);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(i);
  });

  const affaires: Affaire[] = [];
  for (const idxs of groups.values()) {
    const ms = idxs
      .flatMap((i) => threads[i]!)
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    const refs = new Set<string>();
    for (const i of idxs) for (const r of threadRefs[i]!) refs.add(r);
    const last = ms[ms.length - 1]!;
    affaires.push({
      copro: ms[0]!.copro,
      label: last.subject || "(sans objet)",
      mails: ms,
      refs: [...refs],
      first: ms[0]!.receivedAt,
      last: last.receivedAt,
    });
  }
  return affaires.sort((a, b) => b.mails.length - a.mails.length);
}
