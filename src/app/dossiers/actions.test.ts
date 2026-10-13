// Tests de modifierNoteAction (REA-139) : on ne modifie QUE sa propre note, dans son
// perimetre, avec les memes gardes que la suppression. Session, perimetre et depot mockes.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dossier } from "@/lib/domain/dossier";

const etat = vi.hoisted(() => {
  const ref = {
    session: { id: "g1", initiales: "SK" } as { id: string; initiales: string } | null,
    dansPerimetre: true,
    dossier: null as Dossier | null,
    patchs: [] as { id: string; fields: Record<string, unknown> }[],
  };
  return ref;
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getGestionnaireCourant: async () => etat.session }));
vi.mock("@/lib/services/coproprietes/copro-appartient", () => ({
  coproAppartient: async () => etat.dansPerimetre,
}));
vi.mock("@/lib/adapters/router", () => ({
  getDossierRepository: () => ({
    get: async (id: string) => (etat.dossier?.id === id ? etat.dossier : null),
    patch: async (id: string, fields: Record<string, unknown>) => {
      etat.patchs.push({ id, fields });
    },
  }),
}));

import { modifierNoteAction } from "./actions";

const LE_MA_NOTE = "2026-10-02T08:00:00.000Z";
const LE_NOTE_AUTRE = "2026-10-03T08:00:00.000Z";

beforeEach(() => {
  etat.session = { id: "g1", initiales: "SK" };
  etat.dansPerimetre = true;
  etat.patchs.length = 0;
  etat.dossier = {
    id: "d1",
    coproCode: "S0100",
    type: "travaux",
    portee: "copropriete",
    titre: "Ravalement",
    statut: "en_cours",
    ouvertLe: "2026-10-01",
    etapes: [],
    journal: [
      { le: LE_MA_NOTE, par: "SK", texte: "Appel au syndic", kind: "note" },
      { le: LE_NOTE_AUTRE, par: "EL", texte: "Devis reçu", kind: "note" },
    ],
  };
  vi.stubEnv("COPRO_SOURCE", "supabase");
});

describe("modifierNoteAction", () => {
  it("modifie ma note et la date", async () => {
    expect(await modifierNoteAction("d1", LE_MA_NOTE, "Appel au gardien")).toBe(true);
    expect(etat.patchs).toHaveLength(1);
    const journal = etat.patchs[0].fields.journal as Dossier["journal"];
    expect(journal[0].texte).toBe("Appel au gardien");
    expect(journal[0].le).toBe(LE_MA_NOTE);
    expect(journal[0].modifieLe).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(journal[1]).toEqual(etat.dossier!.journal[1]);
  });

  it("refuse la note d'un collègue", async () => {
    expect(await modifierNoteAction("d1", LE_NOTE_AUTRE, "Pirate")).toBe(false);
    expect(etat.patchs).toHaveLength(0);
  });

  it("refuse hors périmètre", async () => {
    etat.dansPerimetre = false;
    expect(await modifierNoteAction("d1", LE_MA_NOTE, "Autre")).toBe(false);
    expect(etat.patchs).toHaveLength(0);
  });

  it("refuse sans session, sur un dossier inconnu ou avec un texte vide", async () => {
    expect(await modifierNoteAction("inconnu", LE_MA_NOTE, "x")).toBe(false);
    expect(await modifierNoteAction("d1", LE_MA_NOTE, "   ")).toBe(false);
    etat.session = null;
    expect(await modifierNoteAction("d1", LE_MA_NOTE, "x")).toBe(false);
    expect(etat.patchs).toHaveLength(0);
  });
});
