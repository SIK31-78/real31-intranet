// L'armoire a cles de l'agence : 6 colonnes de 20 bacs, numerotes T001..T020 dans la
// premiere colonne, T021..T040 dans la deuxieme, etc. (Sekou, 18/09/2026, agence LGC).
// Fonctions pures : ou est un tiroir, ce qu'il contient, de quelle couleur le dessiner.

import type { EtatTrousseau } from "./types";

export const ARMOIRE = { colonnes: 6, bacs: 20 } as const;

export interface PositionTiroir {
  code: string;
  numero: number;
  /** 1 = colonne de gauche. */
  colonne: number;
  /** 1 = bac du haut. */
  bac: number;
}

/** « T041 » -> { colonne 3, bac 1 }. null si le code ne suit pas T + nombre, ou hors armoire. */
export function positionTiroir(code: string | undefined | null): PositionTiroir | null {
  const m = (code ?? "").trim().toUpperCase().match(/^T0*(\d{1,3})$/);
  if (!m) return null;
  const numero = Number(m[1]);
  if (numero < 1 || numero > ARMOIRE.colonnes * ARMOIRE.bacs) return null;
  return { code: codeTiroir(numero), numero, colonne: Math.floor((numero - 1) / ARMOIRE.bacs) + 1, bac: ((numero - 1) % ARMOIRE.bacs) + 1 };
}

export function codeTiroir(numero: number): string {
  return `T${String(numero).padStart(3, "0")}`;
}

/** « colonne 3, bac 1 (en haut) ». */
export function libellePosition(p: PositionTiroir): string {
  const ou = p.bac === 1 ? " (en haut)" : p.bac === ARMOIRE.bacs ? " (en bas)" : "";
  return `colonne ${p.colonne}, bac ${p.bac}${ou}`;
}

export interface TrousseauDansTiroir {
  id: string;
  numero: string;
  etat: EtatTrousseau;
  emplacement?: string;
}

export interface Bac {
  code: string;
  colonne: number;
  bac: number;
  trousseaux: TrousseauDansTiroir[];
  /** Ce qu'on dessine : vide, tout en agence, quelque chose dehors, un retard. */
  ton: "vide" | "ok" | "info" | "warn" | "err";
}

/** L'armoire entiere, bac par bac, a partir des trousseaux (ceux hors armoire sont ignores). */
export function occupationArmoire(trousseaux: TrousseauDansTiroir[]): { bacs: Bac[]; horsArmoire: TrousseauDansTiroir[] } {
  const parCode = new Map<string, TrousseauDansTiroir[]>();
  const horsArmoire: TrousseauDansTiroir[] = [];
  for (const t of trousseaux) {
    if (t.etat === "retire") continue;
    const p = positionTiroir(t.emplacement);
    if (!p) { horsArmoire.push(t); continue; }
    (parCode.get(p.code) ?? parCode.set(p.code, []).get(p.code)!).push(t);
  }
  const bacs: Bac[] = [];
  for (let n = 1; n <= ARMOIRE.colonnes * ARMOIRE.bacs; n++) {
    const p = positionTiroir(codeTiroir(n))!;
    const contenu = (parCode.get(p.code) ?? []).sort((a, b) => a.numero.localeCompare(b.numero));
    bacs.push({ code: p.code, colonne: p.colonne, bac: p.bac, trousseaux: contenu, ton: tonDuBac(contenu) });
  }
  return { bacs, horsArmoire };
}

function tonDuBac(contenu: TrousseauDansTiroir[]): Bac["ton"] {
  if (contenu.length === 0) return "vide";
  if (contenu.some((t) => t.etat === "en_retard" || t.etat === "introuvable")) return "err";
  if (contenu.some((t) => t.etat === "sorti")) return "warn";
  if (contenu.some((t) => t.etat === "reserve")) return "info";
  return "ok";
}

/** Le premier bac libre, pour ranger un nouveau trousseau (null si l'armoire est pleine). */
export function premierBacLibre(bacs: Bac[]): string | null {
  return bacs.find((b) => b.trousseaux.length === 0)?.code ?? null;
}
