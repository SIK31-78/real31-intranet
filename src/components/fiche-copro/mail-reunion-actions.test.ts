// Mail des dates de réunion au conseil syndical : la copie au binôme (28/10/2026). Session,
// référentiel, cascade du CS et résolution du binôme sont mockés ; aucun mail ne part.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  session: { id: "g1", email: "julie@real31.fr", nomComplet: "Julie" } as { id: string; email: string; nomComplet: string } | null,
  emails: ["president@exemple.fr"] as string[],
  enCopie: [] as { nomComplet: string; email: string }[],
  appelsBinome: [] as unknown[][],
}));

vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
  mailModuleActif: () => true,
}));
vi.mock("@/lib/services/coproprietes/copro-appartient", () => ({ coproAppartient: async () => true }));
vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    async findByCode(code: string) {
      return {
        code,
        nom: "Les Tilleuls",
        managerId: "u-g",
        assistantId: "u-a",
        adresse: { ligne1: "1 rue des Lilas", ville: "Paris" },
        prochaineCsDate: "2099-01-15",
      };
    },
  }),
}));
vi.mock("@/lib/services/coproprietes/confirmation-evenement", () => ({ getConfirmations: async () => [] }));
vi.mock("@/lib/services/coproprietes/destinataires-conseil", () => ({
  destinatairesConseilSyndical: async () => ({ source: "estale", emails: etat.emails }),
}));
vi.mock("@/lib/services/coproprietes/assistante-de-copro", () => ({
  binomeEnCopie: async (...args: unknown[]) => {
    etat.appelsBinome.push(args);
    return etat.enCopie;
  },
}));
vi.mock("@/lib/services/mes-emails/get-signature", () => ({ getSignatureGestionnaire: async () => null }));
vi.mock("@/lib/services/coproprietes/envoyer-mail-reunion", () => ({ envoyerMailReunion: async () => undefined }));

import { preparerMailReunionAction } from "./mail-reunion-actions";

beforeEach(() => {
  etat.session = { id: "g1", email: "julie@real31.fr", nomComplet: "Julie" };
  etat.emails = ["president@exemple.fr"];
  etat.enCopie = [];
  etat.appelsBinome = [];
});

describe("preparerMailReunionAction : copie au binôme", () => {
  it("le binôme est demandé pour la personne connectée, CS déjà en « À » exclu", async () => {
    etat.enCopie = [{ nomComplet: "Gaëlle Gestion", email: "gaelle@real31.fr" }];
    const r = await preparerMailReunionAction("S297");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.emails).toEqual(["president@exemple.fr"]);
    expect(r.cc).toEqual(["gaelle@real31.fr"]);
    expect(r.enCopie).toEqual(etat.enCopie);
    const [copro, envoyeur, deja] = etat.appelsBinome[0]!;
    expect((copro as { code: string }).code).toBe("S297");
    expect(envoyeur).toBe("julie@real31.fr");
    expect(deja).toEqual(["president@exemple.fr"]);
  });

  it("personne à mettre en copie : Cc vide", async () => {
    const r = await preparerMailReunionAction("S297");
    expect(r.ok && r.cc).toEqual([]);
    expect(r.ok && r.enCopie).toEqual([]);
  });
});
