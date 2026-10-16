import { beforeEach, describe, expect, it, vi } from "vitest";

// `journaliser` ne lève jamais : une table absente se signale (warn + Sentry) et c'est tout.

const etat = vi.hoisted(() => ({ panne: false, entrees: [] as unknown[], signales: [] as unknown[] }));

vi.mock("@/lib/observabilite", () => ({ signalerException: (err: unknown, ctx: unknown) => etat.signales.push({ err, ctx }) }));
vi.mock("@/lib/adapters/router", () => ({
  getContratsCoproRepository: () => ({
    async ajouterJournal(e: unknown) {
      if (etat.panne) throw new Error('relation "intranet_contrats_journal" does not exist');
      etat.entrees.push(e);
      return { ...(e as object), id: "j1", horodatageISO: "2026-10-16T10:00:00.000Z" };
    },
  }),
}));

import { journaliser } from "./journal";

const ENTREE = { coproCode: "S104", sujet: "gaz" as const, cycleId: "c1", type: "suivi_demarre" as const, parUserId: "u1", parNom: "Camille", details: {} };

beforeEach(() => {
  etat.panne = false;
  etat.entrees = [];
  etat.signales = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("journaliser", () => {
  it("écrit l'entrée telle quelle", async () => {
    await journaliser(ENTREE);
    expect(etat.entrees).toEqual([ENTREE]);
    expect(etat.signales).toHaveLength(0);
  });

  it("table absente : ne lève pas, prévient et signale avec le code copro", async () => {
    etat.panne = true;
    await expect(journaliser(ENTREE)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledOnce();
    expect(etat.signales).toHaveLength(1);
    expect(etat.signales[0]).toMatchObject({ ctx: { source: "contrats-copro-journal", copro: "S104", detail: { type: "suivi_demarre" } } });
  });
});
