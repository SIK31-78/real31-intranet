// Tests de la garde SUPER-ADMIN de creerEntreeAction (création d'une entrée « maison »).
// La session et le service sont mockés ; le rôle est le vrai module (env SUPER_ADMINS
// stubée). On vérifie qu'un non super-admin est REFUSÉ sans que le service soit appelé,
// et qu'un super-admin passe (l'auteur = la session).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => {
  const ref = {
    session: null as { id: string; email?: string; initiales: string } | null,
    appels: [] as { saisie: unknown; auteur: unknown }[],
    patchAppels: [] as { id: string; patch: unknown }[],
    reset() {
      ref.session = { id: "sa", email: "sekou@real31.fr", initiales: "SK" };
      ref.appels.length = 0;
      ref.patchAppels.length = 0;
    },
  };
  return ref;
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
}));
vi.mock("@/lib/services/feedback/creer-entree-admin", () => ({
  creerEntreeAdmin: async (saisie: unknown, auteur: unknown) => {
    etat.appels.push({ saisie, auteur });
    return {};
  },
}));
vi.mock("@/lib/adapters/router", () => ({
  getFeedbackRepository: () => ({
    patch: async (id: string, patch: unknown) => {
      etat.patchAppels.push({ id, patch });
      return { id }; // non-null = trouvee
    },
  }),
}));

import { archiverFeedbackAction, creerEntreeAction, editerFeedbackAction } from "@/app/admin/feedback/actions";

beforeEach(() => {
  etat.reset();
  vi.stubEnv("SUPER_ADMINS", "sekou@real31.fr");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("creerEntreeAction : garde super-admin", () => {
  it("REFUSE un gestionnaire non super-admin (aucun appel au service)", async () => {
    etat.session = { id: "g1", email: "remi@real31.fr", initiales: "RL" };
    const r = await creerEntreeAction({ type: "idee", titre: "Tentative", statut: "livre" });
    expect(r.ok).toBe(false);
    expect(etat.appels).toHaveLength(0);
  });

  it("REFUSE une session absente", async () => {
    etat.session = null;
    const r = await creerEntreeAction({ type: "idee", titre: "Tentative", statut: "livre" });
    expect(r.ok).toBe(false);
    expect(etat.appels).toHaveLength(0);
  });

  it("ACCEPTE un super-admin : l'auteur vient de la session, le service est appelé", async () => {
    const r = await creerEntreeAction({ type: "idee", titre: "Nouvel accueil", statut: "livre" });
    expect(r.ok).toBe(true);
    expect(etat.appels).toHaveLength(1);
    expect(etat.appels[0]?.auteur).toEqual({ email: "sekou@real31.fr", initiales: "SK" });
  });

  it("REFUSE une saisie invalide (titre vide) même pour un super-admin", async () => {
    const r = await creerEntreeAction({ type: "idee", titre: "   ", statut: "livre" });
    expect(r.ok).toBe(false);
    expect(etat.appels).toHaveLength(0);
  });

  it("REFUSE un statut interdit à la création (ecarte)", async () => {
    const r = await creerEntreeAction({ type: "idee", titre: "X", statut: "ecarte" });
    expect(r.ok).toBe(false);
    expect(etat.appels).toHaveLength(0);
  });
});

describe("archiverFeedbackAction : garde super-admin + masquage reversible", () => {
  it("REFUSE un non super-admin (aucun patch)", async () => {
    etat.session = { id: "g1", email: "remi@real31.fr", initiales: "RL" };
    const r = await archiverFeedbackAction({ id: "fb-1", archive: true });
    expect(r.ok).toBe(false);
    expect(etat.patchAppels).toHaveLength(0);
  });

  it("ACCEPTE un super-admin : patche { archive: true }", async () => {
    const r = await archiverFeedbackAction({ id: "fb-1", archive: true });
    expect(r.ok).toBe(true);
    expect(etat.patchAppels).toEqual([{ id: "fb-1", patch: { archive: true } }]);
  });

  it("desarchive avec { archive: false }", async () => {
    const r = await archiverFeedbackAction({ id: "fb-2", archive: false });
    expect(r.ok).toBe(true);
    expect(etat.patchAppels).toEqual([{ id: "fb-2", patch: { archive: false } }]);
  });

  it("REFUSE une saisie invalide (archive non booleen)", async () => {
    const r = await archiverFeedbackAction({ id: "fb-1", archive: "oui" });
    expect(r.ok).toBe(false);
    expect(etat.patchAppels).toHaveLength(0);
  });
});

describe("editerFeedbackAction : edition elargie (description / type)", () => {
  it("patche la description et le type pour un super-admin", async () => {
    const r = await editerFeedbackAction({ id: "fb-1", description: "Nouveau texte", type: "bug" });
    expect(r.ok).toBe(true);
    expect(etat.patchAppels).toEqual([{ id: "fb-1", patch: { description: "Nouveau texte", type: "bug" } }]);
  });

  it("REFUSE une edition vide (rien à modifier)", async () => {
    const r = await editerFeedbackAction({ id: "fb-1" });
    expect(r.ok).toBe(false);
    expect(etat.patchAppels).toHaveLength(0);
  });
});
