// Tests de la garde SUPER-ADMIN de creerEntreeAction (création d'une entrée « maison »).
// La session et le service sont mockés ; le rôle est le vrai module (env SUPER_ADMINS
// stubée). On vérifie qu'un non super-admin est REFUSÉ sans que le service soit appelé,
// et qu'un super-admin passe (l'auteur = la session).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => {
  const ref = {
    session: null as { id: string; email?: string; initiales: string } | null,
    appels: [] as { saisie: unknown; auteur: unknown }[],
    reset() {
      ref.session = { id: "sa", email: "sekou@real31.fr", initiales: "SK" };
      ref.appels.length = 0;
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

import { creerEntreeAction } from "@/app/admin/feedback/actions";

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
