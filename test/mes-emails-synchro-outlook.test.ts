import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockTriRepository } from "@/lib/adapters/mock/mock-tri-repository";

// Répondre depuis Outlook ou depuis l'intranet, sans différence (REA-422, 27/10/2026) : les
// actions de « E-mails » écrivent le lu dans Outlook et le statut en base après un envoi.
// Vraies gardes, journal du tri en mémoire ; session, état et Graph simulés. Données inventées.

const etat = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  repo: null as unknown as MockTriRepository,
  ecrits: [] as { quoi: string; gestionnaireId: string; emailId: string; statut?: string }[],
  graph: [] as { quoi: string; boite: string; id: string }[],
  graphRefuse: false,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
  mailModuleActifPour: () => true,
}));
vi.mock("@/lib/services/mes-emails/get-signature", () => ({ getSignatureGestionnaire: async () => null }));
vi.mock("@/lib/adapters/router", async (original) => ({
  ...(await original<typeof import("@/lib/adapters/router")>()),
  getTriRepository: () => etat.repo,
  getAgenceRepository: () => ({ listerAgences: async () => [{ id: "ag-hls", code: "HLS" }] }),
  getMesEmailsEtatRepository: () => ({
    setLu: async (p: { gestionnaireId: string; emailId: string }) => {
      etat.ecrits.push({ quoi: "lu", gestionnaireId: p.gestionnaireId, emailId: p.emailId });
    },
    setStatut: async (p: { gestionnaireId: string; emailId: string; statut: string }) => {
      etat.ecrits.push({ quoi: "statut", gestionnaireId: p.gestionnaireId, emailId: p.emailId, statut: p.statut });
    },
  }),
  getMailboxProvider: () => ({
    marquerLu: async (p: { boite: string; internetMessageId: string }) => {
      if (etat.graphRefuse) throw new Error("Graph lu 403");
      etat.graph.push({ quoi: "lu", boite: p.boite, id: p.internetMessageId });
    },
  }),
}));
vi.mock("@/lib/observabilite", () => ({ signalerException: () => undefined }));

const { marquerLuAction } = await import("@/app/mes-emails/actions");

const SYNDIC4 = "syndic4@real31.fr";
const sophie = { id: "u1", nomComplet: "Sophie K", initiales: "SK", email: "sophie@real31.fr", agencyId: "ag-hls", role: "GESTIONNAIRE" };

const ranger = (imid: string, gestionnaire: string) =>
  etat.repo.journaliser({
    boite: SYNDIC4,
    internetMessageId: imid,
    messageId: imid,
    expediteur: "client@exemple.fr",
    objet: "Fuite",
    coproReference: "S0297",
    copros: ["S0297"],
    dossierNom: "XX",
    dossierCle: `binome:${gestionnaire}`,
    signal: null,
    candidats: [],
    simulation: true,
    par: "tri",
  });

beforeEach(async () => {
  vi.stubEnv("SUPER_ADMINS", "sekou@real31.fr");
  vi.stubEnv("MAIL_TRI_BOITES", JSON.stringify([{ boite: SYNDIC4, agences: ["HLS"], ecriture: false, automatique: false, envoi: false }]));
  etat.repo = new MockTriRepository({ binomes: [], parCopro: {} });
  etat.ecrits = [];
  etat.graph = [];
  etat.graphRefuse = false;
  etat.session = sophie;
  await ranger("<a-sophie@x>", "sophie@real31.fr");
  await ranger("<b-marc@x>", "marc@real31.fr");
});

afterEach(() => vi.unstubAllEnvs());

describe("marquerLuAction : lu dans l'intranet ET dans Outlook", () => {
  it("boîte perso : pose le lu intranet et le lu Outlook", async () => {
    await marquerLuAction("<perso@x>", "", "sophie@real31.fr");
    expect(etat.ecrits).toEqual([{ quoi: "lu", gestionnaireId: "u1", emailId: "<perso@x>" }]);
    expect(etat.graph).toEqual([{ quoi: "lu", boite: "sophie@real31.fr", id: "<perso@x>" }]);
  });

  it("boîte partagée : lu Outlook pour un mail distribué à mon binôme", async () => {
    await marquerLuAction("<a-sophie@x>", "S0297", SYNDIC4);
    expect(etat.graph).toEqual([{ quoi: "lu", boite: SYNDIC4, id: "<a-sophie@x>" }]);
  });

  it("n'écrit pas dans Outlook un mail d'un autre binôme", async () => {
    await marquerLuAction("<b-marc@x>", "S0297", SYNDIC4);
    expect(etat.graph).toEqual([]);
  });

  it("Graph refuse : l'action n'échoue pas et le lu intranet est posé", async () => {
    etat.graphRefuse = true;
    await expect(marquerLuAction("<perso@x>", "", "sophie@real31.fr")).resolves.toBeUndefined();
    expect(etat.ecrits).toEqual([{ quoi: "lu", gestionnaireId: "u1", emailId: "<perso@x>" }]);
  });
});
