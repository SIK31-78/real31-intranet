// Test du carry de `agencyId` dans l'adapter Supabase des gestionnaires (cloisonnement
// par agence). Client Supabase MOCKE (faux query-builder thenable + maybeSingle), aucun
// reseau. Verifie que agencyId est LU (present dans le SELECT) et reporte sur le domaine,
// et qu'un agencyId absent ne pose pas de cle vide. Adresses inventees @example.test.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  cols: null as string | null,
  reset() {
    etat.row = null;
    etat.cols = null;
  },
}));

function fakeSb() {
  const b: Record<string, unknown> = {};
  b.from = () => b;
  b.select = (cols: string) => {
    etat.cols = cols;
    return b;
  };
  b.eq = () => b;
  b.in = () => b;
  b.ilike = () => b;
  b.maybeSingle = () => Promise.resolve({ data: etat.row, error: null });
  return b;
}

vi.mock("./public-client", () => ({ createSupabasePublicClient: () => fakeSb() }));

import { SupabaseGestionnaireRepository } from "./supabase-gestionnaire-repository";

beforeEach(() => etat.reset());

describe("SupabaseGestionnaireRepository - carry agencyId", () => {
  it("le SELECT lit la colonne agencyId", async () => {
    etat.row = { id: "u1", name: "Jean Test", initials: "JT", email: null, role: null, agencyId: "ag-1" };
    await new SupabaseGestionnaireRepository().findById("u1");
    expect(etat.cols).toContain("agencyId");
  });

  it("reporte agencyId sur le domaine", async () => {
    etat.row = {
      id: "u1",
      name: "Jean Test",
      initials: "JT",
      email: "jean@example.test",
      role: "GESTIONNAIRE",
      agencyId: "ag-1",
    };
    const g = await new SupabaseGestionnaireRepository().findByEmail("jean@example.test");
    expect(g?.agencyId).toBe("ag-1");
  });

  it("agencyId absent -> pas de cle agencyId sur le domaine", async () => {
    etat.row = { id: "u2", name: "Sans Agence", initials: "SA", email: null, role: null, agencyId: null };
    const g = await new SupabaseGestionnaireRepository().findById("u2");
    expect(g && "agencyId" in g).toBe(false);
  });
});
