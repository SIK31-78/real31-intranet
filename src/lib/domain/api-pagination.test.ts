// Tests de la pagination cursor de l'API v1. 100 % offline.

import { describe, expect, it } from "vitest";
import {
  LIMITE_DEFAUT,
  LIMITE_MAX,
  decoderCursor,
  normaliserLimite,
  paginer,
  type PageResultat,
} from "./api-pagination";

const ITEMS = Array.from({ length: 7 }, (_, i) => `item-${i}`);

describe("normaliserLimite", () => {
  it("defaut / bornes / valeurs invalides", () => {
    expect(normaliserLimite(null)).toBe(LIMITE_DEFAUT);
    expect(normaliserLimite("10")).toBe(10);
    expect(normaliserLimite("1000")).toBe(LIMITE_MAX);
    expect(normaliserLimite("0")).toBe(LIMITE_DEFAUT);
    expect(normaliserLimite("abc")).toBe(LIMITE_DEFAUT);
    expect(normaliserLimite("-3")).toBe(LIMITE_DEFAUT);
  });
});

describe("paginer", () => {
  it("premiere page + curseur de suite", () => {
    const page = paginer(ITEMS, null, "3");
    expect(page.items).toEqual(["item-0", "item-1", "item-2"]);
    expect(page.total).toBe(7);
    expect(page.nextCursor).toBeDefined();
  });

  it("le curseur enchaine les pages jusqu'au bout, sans doublon ni trou", () => {
    const vus: string[] = [];
    let cursor: string | null = null;
    for (let garde = 0; garde < 10; garde++) {
      const page: PageResultat<string> = paginer(ITEMS, cursor, "3");
      vus.push(...page.items);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(vus).toEqual(ITEMS);
  });

  it("derniere page : pas de nextCursor", () => {
    const p1 = paginer(ITEMS, null, "7");
    expect(p1.items).toHaveLength(7);
    expect(p1.nextCursor).toBeUndefined();
  });

  it("curseur forge/invalide -> on repart du debut (jamais une erreur)", () => {
    expect(decoderCursor("n'importe quoi")).toBeNull();
    const page = paginer(ITEMS, "zzz-invalide", "2");
    expect(page.items).toEqual(["item-0", "item-1"]);
  });

  it("liste vide", () => {
    const page = paginer([], null, null);
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.nextCursor).toBeUndefined();
  });
});
