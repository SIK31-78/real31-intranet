// Transfert d'un mail ENVOYÉ (02/11/2026) : l'envoyé doit être dans la liste que la personne
// voit (boîte partagée : envoyés de son binôme) ; l'internetMessageId transféré est celui que
// le serveur relit, jamais celui du client. Gardes et services doublés.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  session: { id: "g1", email: "oceane@real31.fr", nomComplet: "Océane", initiales: "OC" } as Record<string, string> | null,
  cible: "syndic2@real31.fr" as string | null,
  personnelle: false,
  // Ce que la liste des Envoyés du binôme montre : id Graph -> internetMessageId.
  visibles: new Map<string, string>([["graph-1", "<envoye-1@real31.fr>"]]),
}));
const services = vi.hoisted(() => ({
  transfererMail: vi.fn(async () => ({})),
  envoyeVisible: vi.fn(async (_boite: string, id: string) => {
    const imid = etat.visibles.get(id);
    return imid ? { id, internetMessageId: imid } : null;
  }),
  perimetreEnvoyes: vi.fn(async () => ({ conversations: new Set(), references: new Set(), referencesAutres: new Set() })),
}));

vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
  mailModuleActifPour: () => true,
  incarnationEnCours: async () => false,
}));
vi.mock("@/lib/auth/roles", () => ({ estSuperAdmin: () => false }));
vi.mock("@/lib/observabilite", () => ({ tracer: vi.fn(), signaler: vi.fn(), signalerException: vi.fn() }));
vi.mock("./gardes-boites", () => ({
  boiteCible: async () => etat.cible,
  boiteDuMail: async () => etat.cible,
  boitePartageeDe: async () => etat.cible,
  natureBoite: async () => (etat.personnelle ? "mienne" : "partagee"),
  boitesDe: async () => [{ id: etat.cible, personnelle: etat.personnelle }],
}));
vi.mock("@/lib/services/mes-emails/envoyes", () => ({ envoyeVisible: services.envoyeVisible, lireEnvoye: vi.fn(), listerEnvoyes: vi.fn() }));
vi.mock("@/lib/services/mes-emails/transferer", () => ({ transfererMail: services.transfererMail }));
vi.mock("@/lib/services/mes-emails/boites-visibles", () => ({ perimetreEnvoyes: services.perimetreEnvoyes, mailDistribue: vi.fn() }));
vi.mock("@/lib/services/mes-emails/get-signature", () => ({ getSignatureGestionnaire: async () => null }));
vi.mock("@/lib/domain/mail-gate", async (orig) => ({ ...(await orig<object>()), envoiMailPour: () => false }));

import { transfererEnvoyeAction } from "./actions";

const saisie = { boite: "syndic2@real31.fr", a: ["cs@exemple.fr"], cc: [], corps: "Pour info." };

beforeEach(() => {
  etat.session = { id: "g1", email: "oceane@real31.fr", nomComplet: "Océane", initiales: "OC" };
  etat.cible = "syndic2@real31.fr";
  etat.personnelle = false;
  vi.clearAllMocks();
});

describe("transfererEnvoyeAction", () => {
  it("transfère l'envoyé de la liste du binôme, par l'internetMessageId relu côté serveur", async () => {
    const r = await transfererEnvoyeAction({ ...saisie, id: "graph-1" });
    expect(r).toEqual({ ok: true, donnees: { envoye: false, boite: "syndic2@real31.fr" } });
    expect(services.perimetreEnvoyes).toHaveBeenCalled();
    expect(services.transfererMail).toHaveBeenCalledWith(
      expect.objectContaining({ boite: "syndic2@real31.fr", internetMessageId: "<envoye-1@real31.fr>", a: ["cs@exemple.fr"], envoyer: false }),
    );
  });

  it("refuse un envoyé d'un autre binôme (absent de la liste) sans rien transférer", async () => {
    const r = await transfererEnvoyeAction({ ...saisie, id: "graph-autre-binome" });
    expect(r).toEqual({ ok: false, erreur: "Ce mail envoyé n'est pas dans les envoyés de ton binôme." });
    expect(services.transfererMail).not.toHaveBeenCalled();
  });

  it("refuse une boîte non autorisée, et sans session", async () => {
    etat.cible = null;
    expect(await transfererEnvoyeAction({ ...saisie, id: "graph-1" })).toMatchObject({ ok: false, erreur: "Boîte non autorisée." });
    etat.session = null;
    expect(await transfererEnvoyeAction({ ...saisie, id: "graph-1" })).toMatchObject({ ok: false });
    expect(services.envoyeVisible).not.toHaveBeenCalled();
    expect(services.transfererMail).not.toHaveBeenCalled();
  });

  it("boîte perso : pas de périmètre de binôme, le transfert part", async () => {
    etat.cible = "oceane@real31.fr";
    etat.personnelle = true;
    const r = await transfererEnvoyeAction({ ...saisie, boite: "oceane@real31.fr", id: "graph-1" });
    expect(r).toMatchObject({ ok: true, donnees: { envoye: true } });
    expect(services.perimetreEnvoyes).not.toHaveBeenCalled();
    expect(services.envoyeVisible).toHaveBeenCalledWith("oceane@real31.fr", "graph-1", undefined);
  });

  it("ignore un internetMessageId glissé par le client", async () => {
    await transfererEnvoyeAction({ ...saisie, id: "graph-1", emailId: "<forge@x>", internetMessageId: "<forge@x>" });
    expect(services.transfererMail).toHaveBeenCalledWith(expect.objectContaining({ internetMessageId: "<envoye-1@real31.fr>" }));
  });
});
