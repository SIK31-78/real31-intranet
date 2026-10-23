// L'armoire a cles de l'agence : des colonnes de 20 bacs, numerotes T001..T020 dans la
// premiere colonne, T021..T040 dans la deuxieme, etc. (Sekou, 18/09/2026, agence LGC).
// Chaque agence a la sienne : 6 colonnes a LGC, 3 a HLS (Paperflow 60 tiroirs, 23/10/2026).
// Fonctions pures : ou est un tiroir, ce qu'il contient, de quelle couleur le dessiner.

import type { EtatTrousseau } from "./types";

export interface DimensionsArmoire {
  colonnes: number;
  bacs: number;
}

/** L'armoire de LGC, la premiere : sert aussi aux agences sans armoire declaree et a la vue cabinet. */
export const ARMOIRE: DimensionsArmoire = { colonnes: 6, bacs: 20 };

const ARMOIRES: Record<string, DimensionsArmoire> = {
  LGC: ARMOIRE,
  HLS: { colonnes: 3, bacs: 20 },
};

export function armoireDe(agenceCode: string | undefined | null): DimensionsArmoire {
  return ARMOIRES[(agenceCode ?? "").toUpperCase()] ?? ARMOIRE;
}

export interface PositionTiroir {
  code: string;
  numero: number;
  /** 1 = colonne de gauche. */
  colonne: number;
  /** 1 = bac du haut. */
  bac: number;
}

/** « T041 » -> { colonne 3, bac 1 }. null si le code ne suit pas T + nombre, ou hors armoire. */
export function positionTiroir(code: string | undefined | null, a: DimensionsArmoire = ARMOIRE): PositionTiroir | null {
  const m = (code ?? "").trim().toUpperCase().match(/^T0*(\d{1,3})$/);
  if (!m) return null;
  const numero = Number(m[1]);
  if (numero < 1 || numero > a.colonnes * a.bacs) return null;
  return { code: codeTiroir(numero), numero, colonne: Math.floor((numero - 1) / a.bacs) + 1, bac: ((numero - 1) % a.bacs) + 1 };
}

export function codeTiroir(numero: number): string {
  return `T${String(numero).padStart(3, "0")}`;
}

/** « colonne 3, bac 1 (en haut) ». */
export function libellePosition(p: PositionTiroir, a: DimensionsArmoire = ARMOIRE): string {
  const ou = p.bac === 1 ? " (en haut)" : p.bac === a.bacs ? " (en bas)" : "";
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
export function occupationArmoire(trousseaux: TrousseauDansTiroir[], a: DimensionsArmoire = ARMOIRE): { bacs: Bac[]; horsArmoire: TrousseauDansTiroir[] } {
  const parCode = new Map<string, TrousseauDansTiroir[]>();
  const horsArmoire: TrousseauDansTiroir[] = [];
  for (const t of trousseaux) {
    if (t.etat === "retire") continue;
    const p = positionTiroir(t.emplacement, a);
    if (!p) { horsArmoire.push(t); continue; }
    (parCode.get(p.code) ?? parCode.set(p.code, []).get(p.code)!).push(t);
  }
  const bacs: Bac[] = [];
  for (let n = 1; n <= a.colonnes * a.bacs; n++) {
    const p = positionTiroir(codeTiroir(n), a)!;
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
