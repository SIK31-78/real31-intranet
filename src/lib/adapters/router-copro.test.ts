// Test du routage de getCoproRepository : composite quand COPRO_SOURCE=supabase + eStale
// configure + interrupteur actif ; sinon SupabaseCoproRepository seul (ou mock offline).
// Aucune I/O : les adapters ne font rien a la construction.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCoproRepository } from "@/lib/adapters/router";
import { CompositeCoproRepository } from "@/lib/adapters/composite/composite-copro-repository";
import { SupabaseCoproRepository } from "@/lib/adapters/supabase/supabase-copro-repository";
import { MockCoproRepository } from "@/lib/adapters/mock/mock-copro-repository";

const ENV = process.env;
beforeEach(() => {
  process.env = { ...ENV };
  process.env.COPRO_SOURCE = "supabase";
  process.env.ESTALE_EMAIL = "svc@real31.fr";
  process.env.ESTALE_PASSWORD = "secret";
  delete process.env.COPRO_ESTALE_LIVE;
});
afterEach(() => {
  process.env = ENV;
});

describe("getCoproRepository", () => {
  it("supabase + eStale configure + interrupteur absent (defaut actif) -> COMPOSITE", () => {
    expect(getCoproRepository()).toBeInstanceOf(CompositeCoproRepository);
  });

  it("interrupteur COPRO_ESTALE_LIVE=off -> SupabaseCoproRepository seul (pur miroir)", () => {
    process.env.COPRO_ESTALE_LIVE = "off";
    const repo = getCoproRepository();
    expect(repo).toBeInstanceOf(SupabaseCoproRepository);
    expect(repo).not.toBeInstanceOf(CompositeCoproRepository);
  });

  it("interrupteur false / 0 / no -> pur miroir aussi", () => {
    for (const v of ["false", "0", "no"]) {
      process.env.COPRO_ESTALE_LIVE = v;
      expect(getCoproRepository()).toBeInstanceOf(SupabaseCoproRepository);
    }
  });

  it("eStale non configure -> SupabaseCoproRepository seul", () => {
    delete process.env.ESTALE_EMAIL;
    delete process.env.ESTALE_PASSWORD;
    const repo = getCoproRepository();
    expect(repo).toBeInstanceOf(SupabaseCoproRepository);
    expect(repo).not.toBeInstanceOf(CompositeCoproRepository);
  });

  it("COPRO_SOURCE != supabase -> mock (offline)", () => {
    process.env.COPRO_SOURCE = "mock";
    expect(getCoproRepository()).toBeInstanceOf(MockCoproRepository);
  });
});
