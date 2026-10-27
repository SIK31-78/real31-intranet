import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// L'historique de la conversation dans le tri (REA-352, 16/10/2026) : la garde de l'écran et
// la boîte lue (TOUJOURS une boîte triée que la personne a le droit de trier, revérifiée
// côté serveur ; V2 du 27/10/2026). La session et le service sont mockés ; on ne teste pas
// la lecture Graph.

const etat = vi.hoisted(() => ({
  session: null as { id: string; nomComplet: string; initiales: string; email?: string } | null,
  appels: [] as { boite: string; id: string }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
}));
vi.mock("@/lib/services/mes-emails/historique-mail", () => ({
  historiqueDuMail: async (boite: string, id: string) => {
    etat.appels.push({ boite, id });
    return "> Bonjour, la porte du hall ne ferme plus.";
  },
}));
vi.mock("@/lib/services/tri-emails/ranger", () => ({}));
vi.mock("@/lib/services/tri-emails/compteur", () => ({ oublierCompteur: () => undefined }));
vi.mock("@/lib/services/tri-emails/binomes", () => ({}));
vi.mock("@/lib/services/tri-emails/pieces-jointes", () => ({}));
vi.mock("@/lib/services/tri-emails/copro-pieces-jointes", () => ({}));

import { chargerHistoriqueTriAction } from "./actions";

const pilote = { id: "u1", nomComplet: "Sekou KOMA", initiales: "SK", email: "sekou@real31.fr" };
const collegue = { id: "u2", nomComplet: "Rémi BARD", initiales: "RB", email: "remi@real31.fr" };

beforeEach(() => {
  vi.stubEnv("SUPER_ADMINS", "sekou@real31.fr");
  vi.stubEnv("MAIL_TRI_BOITES", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  etat.appels = [];
});

describe("chargerHistoriqueTriAction", () => {
  it("lit l'historique dans la boîte du tri pour le super-admin", async () => {
    vi.stubEnv("MAIL_BOITE_TRI", "Syndic@real31.fr");
    etat.session = pilote;
    const r = await chargerHistoriqueTriAction({ boite: "syndic@real31.fr", internetMessageId: "<abc@x>" });
    expect(r).toEqual({ ok: true, donnees: "> Bonjour, la porte du hall ne ferme plus." });
    expect(etat.appels).toEqual([{ boite: "syndic@real31.fr", id: "<abc@x>" }]);
  });

  it("refuse une boîte hors de la config, même au super-admin, sans lire", async () => {
    vi.stubEnv("MAIL_BOITE_TRI", "syndic@real31.fr");
    etat.session = pilote;
    const r = await chargerHistoriqueTriAction({ boite: "autre@real31.fr", internetMessageId: "<abc@x>" });
    expect(r.ok).toBe(false);
    expect(etat.appels).toHaveLength(0);
  });

  it("refuse hors de l'agence de la boîte, sans lire la boîte", async () => {
    vi.stubEnv("MAIL_BOITE_TRI", "syndic@real31.fr");
    etat.session = collegue;
    const r = await chargerHistoriqueTriAction({ boite: "syndic@real31.fr", internetMessageId: "<abc@x>" });
    expect(r.ok).toBe(false);
    expect(etat.appels).toHaveLength(0);
  });

  it("l'échantillon fictif n'a pas d'historique", async () => {
    vi.stubEnv("MAIL_BOITE_TRI", "echantillon");
    etat.session = pilote;
    expect(await chargerHistoriqueTriAction({ boite: "echantillon", internetMessageId: "<abc@x>" })).toEqual({ ok: true, donnees: "" });
    expect(etat.appels).toHaveLength(0);
  });

  it("refuse un identifiant vide", async () => {
    etat.session = pilote;
    expect((await chargerHistoriqueTriAction({ boite: "syndic@real31.fr", internetMessageId: "" })).ok).toBe(false);
  });
});
