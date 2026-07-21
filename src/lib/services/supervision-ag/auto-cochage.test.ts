// Tests des branchements service -> supervision (auto-cochage).
// Le routeur est mocke : on verifie le BON itemId sur le BON agId, le mapping
// d'agId (CODE__nextAGDate pour le CS, CODE__agDate pour le recap), le no-op quand
// il n'y a pas d'AG en preparation, et le caractere BEST-EFFORT (un echec du port
// supervision ne remonte jamais).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => {
  const ref = {
    // Appels captures a setStatutItem.
    appels: [] as { agId: string; itemId: string; statut: string; initiales: string }[],
    // Copro renvoyee par findByCode (null = introuvable / hors scope).
    copro: null as { prochaineAg?: { date: string } } | null,
    // Injection d'erreurs pour tester le best-effort.
    setStatutThrows: false,
    findByCodeThrows: false,
    reset() {
      ref.appels.length = 0;
      ref.copro = null;
      ref.setStatutThrows = false;
      ref.findByCodeThrows = false;
    },
  };
  return ref;
});

vi.mock("@/lib/adapters/router", () => ({
  getSupervisionAgProvider: () => ({
    async setStatutItem(
      agId: string,
      itemId: string,
      statut: string,
      auditeur: { initiales: string },
    ) {
      if (etat.setStatutThrows) throw new Error("supervision indisponible");
      etat.appels.push({ agId, itemId, statut, initiales: auditeur.initiales });
      return {};
    },
  }),
  getCoproRepository: () => ({
    async findByCode() {
      if (etat.findByCodeThrows) throw new Error("copro indisponible");
      return etat.copro;
    },
  }),
}));

import { marquerRecapFait, marquerHonorairesCsTraite } from "./auto-cochage";

beforeEach(() => etat.reset());
afterEach(() => vi.restoreAllMocks());

describe("marquerRecapFait", () => {
  it("coche apag.recap-reality 'ok' sur CODE__agDate avec les initiales", async () => {
    await marquerRecapFait("S104", "2026-05-28", "EL");
    expect(etat.appels).toEqual([
      { agId: "S104__2026-05-28", itemId: "apag.recap-reality", statut: "ok", initiales: "EL" },
    ]);
  });

  it("best-effort : un echec du port supervision ne remonte pas", async () => {
    etat.setStatutThrows = true;
    await expect(marquerRecapFait("S104", "2026-05-28", "EL")).resolves.toBeUndefined();
    expect(etat.appels).toHaveLength(0);
  });
});

describe("marquerHonorairesCsTraite", () => {
  it("cible l'AG EN PREPARATION : apcs.honos 'ok' sur CODE__{prochaineAg.date}", async () => {
    etat.copro = { prochaineAg: { date: "2026-09-15" } };
    await marquerHonorairesCsTraite("S104", "mgr-1", "EL");
    expect(etat.appels).toEqual([
      { agId: "S104__2026-09-15", itemId: "apcs.honos", statut: "ok", initiales: "EL" },
    ]);
  });

  it("no-op s'il n'y a pas de prochaine AG (rien a cocher)", async () => {
    etat.copro = {}; // pas de prochaineAg
    await marquerHonorairesCsTraite("S104", "mgr-1", "EL");
    expect(etat.appels).toHaveLength(0);
  });

  it("no-op si la copro est introuvable / hors scope", async () => {
    etat.copro = null;
    await marquerHonorairesCsTraite("S104", "mgr-1", "EL");
    expect(etat.appels).toHaveLength(0);
  });

  it("best-effort : findByCode qui echoue ne remonte pas", async () => {
    etat.findByCodeThrows = true;
    await expect(marquerHonorairesCsTraite("S104", "mgr-1", "EL")).resolves.toBeUndefined();
    expect(etat.appels).toHaveLength(0);
  });

  it("best-effort : setStatutItem qui echoue ne remonte pas", async () => {
    etat.copro = { prochaineAg: { date: "2026-09-15" } };
    etat.setStatutThrows = true;
    await expect(marquerHonorairesCsTraite("S104", "mgr-1", "EL")).resolves.toBeUndefined();
    expect(etat.appels).toHaveLength(0);
  });
});
