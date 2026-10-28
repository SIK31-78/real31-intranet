// Journal d'usage de l'IA : ce qui part en base (des compteurs, aucun texte), et l'app qui
// tourne quand la table n'existe pas encore.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  erreur: null as { code?: string; message: string } | null,
  inserts: [] as Record<string, unknown>[],
  filtres: [] as [string, string][],
  count: 3,
}));

vi.mock("./public-client", () => ({
  createSupabasePublicClient: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        etat.inserts.push(row);
        return { error: etat.erreur };
      },
      select: () => {
        const q = {
          eq: (col: string, v: string) => {
            etat.filtres.push([col, v]);
            return q;
          },
          then: (ok: (r: { count: number | null; error: unknown }) => unknown) => ok({ count: etat.erreur ? null : etat.count, error: etat.erreur }),
        };
        return q;
      },
    }),
  }),
}));

import { SupabaseIaUsageRepository } from "./supabase-ia-usage-repository";

const LIGNE = {
  fonction: "reformulation",
  gestionnaireId: "g1",
  initiales: "SK",
  incarnation: false,
  modele: "claude-sonnet-5-5",
  tokensEntree: 1300,
  tokensSortie: 150,
  coutEstime: 0.0041,
  dureeMs: 1500,
  succes: true,
  erreur: null,
  jour: "2026-10-28",
};

beforeEach(() => {
  etat.erreur = null;
  etat.inserts.length = 0;
  etat.filtres.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("SupabaseIaUsageRepository", () => {
  it("écrit une ligne de compteurs, sans aucun texte de mail", async () => {
    await new SupabaseIaUsageRepository().enregistrer(LIGNE);
    expect(etat.inserts[0]).toEqual({
      fonction: "reformulation",
      gestionnaire_id: "g1",
      initiales: "SK",
      incarnation: false,
      modele: "claude-sonnet-5-5",
      tokens_entree: 1300,
      tokens_sortie: 150,
      cout_estime: 0.0041,
      duree_ms: 1500,
      succes: true,
      erreur: null,
      jour: "2026-10-28",
    });
  });

  it("compte les appels du jour de la personne pour la fonction", async () => {
    expect(await new SupabaseIaUsageRepository().compterDuJour("g1", "reformulation", "2026-10-28")).toBe(3);
    expect(etat.filtres).toEqual([
      ["gestionnaire_id", "g1"],
      ["fonction", "reformulation"],
      ["jour", "2026-10-28"],
    ]);
  });

  it("table absente : l'écriture ne fait rien, le comptage rend null", async () => {
    etat.erreur = { code: "PGRST205", message: "absente" };
    const repo = new SupabaseIaUsageRepository();
    await expect(repo.enregistrer(LIGNE)).resolves.toBeUndefined();
    expect(await repo.compterDuJour("g1", "reformulation", "2026-10-28")).toBeNull();
  });

  it("autre erreur : levée (le service la signale sans bloquer)", async () => {
    etat.erreur = { code: "XX000", message: "panne" };
    await expect(new SupabaseIaUsageRepository().enregistrer(LIGNE)).rejects.toThrow("Journal d'usage IA");
  });
});
