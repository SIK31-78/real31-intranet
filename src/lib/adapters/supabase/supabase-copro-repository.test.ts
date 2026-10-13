// setDateEvenement de l'adapter Supabase (REA-274) : plus de cloisonnement
// gestionnaire/assistant a l'ecriture, l'autorite est verifiee en amont (ADR-041).
// Faux client PostgREST : on enregistre les filtres et l'UPDATE, aucune base touchee.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  filtresLecture: [] as string[],
  lignesLues: [{ id: "fiche-1" }] as { id: string }[],
  updates: [] as { valeurs: Record<string, unknown>; id: string }[],
  lignesEcrites: [{ id: "fiche-1" }] as { id: string }[] | null,
  erreurEcriture: null as { message: string } | null,
}));

vi.mock("./public-client", () => ({
  createSupabasePublicClient: () => ({
    from: () => {
      const lecture = {
        select: () => lecture,
        or: (f: string) => {
          etat.filtresLecture.push(f);
          return lecture;
        },
        limit: async () => ({ data: etat.lignesLues, error: null }),
      };
      return {
        ...lecture,
        update: (valeurs: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => ({
            select: async () => {
              etat.updates.push({ valeurs, id });
              return { data: etat.lignesEcrites, error: etat.erreurEcriture };
            },
          }),
        }),
      };
    },
  }),
}));

import type { CoproRepository } from "@/lib/ports/copro-repository";
import { SupabaseCoproRepository } from "./supabase-copro-repository";

// Appel par le PORT, comme le routeur : l'adapter ignore l'auteur (pas de cloisonnement).
const repo = (): CoproRepository => new SupabaseCoproRepository();

beforeEach(() => {
  etat.filtresLecture = [];
  etat.lignesLues = [{ id: "fiche-1" }];
  etat.updates = [];
  etat.lignesEcrites = [{ id: "fiche-1" }];
  etat.erreurEcriture = null;
});

describe("SupabaseCoproRepository.setDateEvenement", () => {
  it("ecrit pour un ADMIN ou un delegue hors portefeuille : aucun filtre managerId/assistantId", async () => {
    await repo().setDateEvenement("S104", "cs", "derniere", "2026-09-03", "u-admin");
    expect(etat.filtresLecture).toEqual(["referenceCrypto.eq.S104,referenceEstale.eq.S104"]);
    expect(etat.updates).toHaveLength(1);
    expect(etat.updates[0]!.id).toBe("fiche-1");
    expect(etat.updates[0]!.valeurs).toMatchObject({ lastCSDate: "2026-09-03" });
  });

  it("vise la bonne colonne (prochaine AG, effacement)", async () => {
    await repo().setDateEvenement("S104", "ag", "prochaine", null, "u1");
    expect(etat.updates[0]!.valeurs).toMatchObject({ nextAGDate: null });
  });

  it("copro inconnue : erreur dite, rien n'est ecrit", async () => {
    etat.lignesLues = [];
    await expect(
      repo().setDateEvenement("S999", "cs", "prochaine", "2026-10-10", "u1"),
    ).rejects.toThrow(/introuvable\./);
    expect(etat.updates).toHaveLength(0);
  });

  it("aucune ligne ecrite : vraie erreur, jamais un succes muet", async () => {
    etat.lignesEcrites = [];
    await expect(
      repo().setDateEvenement("S104", "cs", "prochaine", "2026-10-10", "u1"),
    ).rejects.toThrow(/0 fiche modifiée/);
  });

  it("erreur base a l'ecriture : remonte", async () => {
    etat.erreurEcriture = { message: "permission denied" };
    await expect(
      repo().setDateEvenement("S104", "cs", "prochaine", "2026-10-10", "u1"),
    ).rejects.toThrow(/permission denied/);
  });
});
