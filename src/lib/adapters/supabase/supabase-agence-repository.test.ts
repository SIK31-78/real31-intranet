// Tests de l'adapter Supabase du lecteur d'agences. Client Supabase MOCKE (faux
// query-builder thenable, aucun reseau). Verifie le mapping name -> code, l'exclusion
// des lignes incompletes, et la DEGRADATION table-absente (42P01 / PGRST205 -> []) vs
// le THROW sur une erreur SQL reelle.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  response: { data: null as unknown, error: null as unknown },
  reset() {
    etat.response = { data: null, error: null };
  },
}));

function fakeSb() {
  const b: Record<string, unknown> = {};
  b.from = () => b;
  b.select = () => b;
  b.then = (resolve: (v: unknown) => void) => resolve(etat.response);
  return b;
}

vi.mock("./public-client", () => ({ createSupabasePublicClient: () => fakeSb() }));

import { SupabaseAgenceRepository } from "./supabase-agence-repository";

beforeEach(() => etat.reset());

describe("SupabaseAgenceRepository", () => {
  it("mappe public.Agency (name -> code) et ignore les lignes incompletes", async () => {
    etat.response = {
      data: [
        { id: "a1", name: "LGC" },
        { id: "a2", name: "ML" },
        { id: "a3", name: null }, // name manquant -> ignore
        { id: "", name: "HLS" }, // id vide -> ignore
      ],
      error: null,
    };
    const agences = await new SupabaseAgenceRepository().listerAgences();
    expect(agences).toEqual([
      { id: "a1", code: "LGC" },
      { id: "a2", code: "ML" },
    ]);
  });

  it("table absente (42P01) -> [] (pas de filtre agence, pas de crash)", async () => {
    etat.response = { data: null, error: { code: "42P01", message: "relation does not exist" } };
    expect(await new SupabaseAgenceRepository().listerAgences()).toEqual([]);
  });

  it("table absente (PGRST205 / schema cache) -> []", async () => {
    etat.response = {
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.Agency'" },
    };
    expect(await new SupabaseAgenceRepository().listerAgences()).toEqual([]);
  });

  it("erreur SQL reelle (pas une table absente) -> THROW (schema a corriger)", async () => {
    etat.response = { data: null, error: { code: "42501", message: "permission denied" } };
    await expect(new SupabaseAgenceRepository().listerAgences()).rejects.toThrow(/Agency/);
  });
});
