// Tests du versant ECRITURE de l'adapter Supabase des listes de diffusion Crypto
// (remplacerListeCS). Le client Supabase est MOCKE par un faux query-builder chainable :
// aucune connexion reseau. On verifie les deux branches (UPDATE si la ligne CS existe,
// INSERT avec idref synthetique sinon), la pose du marqueur edite_le, et le PIEGE schema :
// une COLONNE absente (PGRST204) doit THROW, une TABLE absente doit lever l'erreur dediee.
// Adresses inventees @example.test : aucune PII.

import { beforeEach, describe, expect, it, vi } from "vitest";

// Etat pilotant le faux client + capture des payloads ecrits.
const etat = vi.hoisted(() => ({
  selectResponse: { data: [] as { idref: string }[] | null, error: null as unknown },
  writeError: null as unknown,
  captured: { op: null as null | "update" | "insert", payload: null as Record<string, unknown> | null },
  reset() {
    etat.selectResponse = { data: [], error: null };
    etat.writeError = null;
    etat.captured = { op: null, payload: null };
  },
}));

// Faux query-builder : chainable et thenable. Le meme objet enchaine select PUIS
// update/insert dans un seul remplacerListeCS (awaits sequentiels).
function fakeSb() {
  let op: "select" | "update" | "insert" | null = null;
  const b: Record<string, unknown> = {};
  const chain = () => b;
  b.from = chain;
  b.select = () => {
    op = "select";
    return b;
  };
  b.eq = () => b;
  b.limit = () => b;
  b.update = (payload: Record<string, unknown>) => {
    op = "update";
    etat.captured = { op: "update", payload };
    return b;
  };
  b.insert = (payload: Record<string, unknown>) => {
    op = "insert";
    etat.captured = { op: "insert", payload };
    return b;
  };
  b.then = (resolve: (v: unknown) => void) => {
    if (op === "select") return resolve(etat.selectResponse);
    return resolve({ error: etat.writeError });
  };
  return b;
}

vi.mock("./public-client", () => ({
  createSupabasePublicClient: () => fakeSb(),
}));

import {
  SupabaseListesDiffusionRepository,
  ListesDiffusionPersistanceIndisponible,
} from "./supabase-listes-diffusion-repository";

beforeEach(() => etat.reset());

describe("SupabaseListesDiffusionRepository.remplacerListeCS", () => {
  const repo = new SupabaseListesDiffusionRepository();

  it("UPDATE quand une ligne CS existe deja (garde son idref, pose edite_le)", async () => {
    etat.selectResponse = { data: [{ idref: "313" }], error: null };
    await repo.remplacerListeCS("S046", ["m1@example.test", "m2@example.test"]);
    expect(etat.captured.op).toBe("update");
    expect(etat.captured.payload?.emails).toEqual(["m1@example.test", "m2@example.test"]);
    expect(etat.captured.payload?.edite_le).toBeTruthy(); // marqueur d'edition pose
  });

  it("INSERT avec idref synthetique quand aucune ligne CS (copro jamais importee)", async () => {
    etat.selectResponse = { data: [], error: null };
    await repo.remplacerListeCS("S046", ["m1@example.test"]);
    expect(etat.captured.op).toBe("insert");
    // Code normalise (S046 -> S46) et cle synthetique stable, hors espace des idref Crypto.
    expect(etat.captured.payload?.idref).toBe("intranet:S46:conseil_syndical");
    expect(etat.captured.payload?.copro_code).toBe("S46");
    expect(etat.captured.payload?.type_liste).toBe("conseil_syndical");
    expect(etat.captured.payload?.emails).toEqual(["m1@example.test"]);
    expect(etat.captured.payload?.edite_le).toBeTruthy();
  });

  it("COLONNE edite_le absente (PGRST204) -> THROW (schema a corriger, pas un no-op)", async () => {
    etat.selectResponse = { data: [{ idref: "313" }], error: null };
    etat.writeError = {
      code: "PGRST204",
      message: "Could not find the 'edite_le' column of 'intranet_listes_diffusion' in the schema cache",
    };
    await expect(repo.remplacerListeCS("S46", ["m1@example.test"])).rejects.toThrow();
  });

  it("TABLE absente (42P01) -> ListesDiffusionPersistanceIndisponible (catchable, pas de crash)", async () => {
    etat.selectResponse = { data: null, error: { code: "42P01", message: "relation ... does not exist" } };
    await expect(repo.remplacerListeCS("S46", ["m1@example.test"])).rejects.toBeInstanceOf(
      ListesDiffusionPersistanceIndisponible,
    );
  });
});
