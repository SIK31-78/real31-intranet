// Action « Comptabilité » de l'écran E-mails : même garde que « Pas pour moi » (boîte partagée
// visible, mail distribué au binôme), puis le service. Garde et service sont doublés.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  session: { id: "g1", email: "mylene.pin@real31.fr" } as { id: string; email: string } | null,
  partagee: "syndic4@real31.fr" as string | null,
  erreurService: null as Error | null,
}));

const garde = vi.hoisted(() => vi.fn(async () => etat.partagee));
const service = vi.hoisted(() =>
  vi.fn(async () => {
    if (etat.erreurService) throw etat.erreurService;
    return { journalId: "j2", dossierNom: "Comptabilité", simulation: true, etiquetteNonPosee: false };
  }),
);
const oublier = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getGestionnaireCourant: async () => etat.session }));
vi.mock("@/lib/observabilite", () => ({ tracer: vi.fn(), signaler: vi.fn(), signalerException: vi.fn() }));
vi.mock("./gardes-boites", () => ({ boitePartageeDe: garde }));
vi.mock("@/lib/services/tri-emails/reaffecter", () => ({ envoyerEnComptabilite: service }));
vi.mock("@/lib/services/mes-emails/compteur-emails", () => ({ oublierCompteurEmails: oublier }));

import { envoyerEnComptabiliteAction } from "./actions-comptabilite";

beforeEach(() => {
  etat.session = { id: "g1", email: "mylene.pin@real31.fr" };
  etat.partagee = "syndic4@real31.fr";
  etat.erreurService = null;
  vi.clearAllMocks();
});

describe("envoyerEnComptabiliteAction", () => {
  it("envoie le mail en Comptabilité dans la boîte du mail, au nom de la personne", async () => {
    expect(await envoyerEnComptabiliteAction("<m1@x>", "Syndic4@real31.fr")).toEqual({
      ok: true,
      donnees: { dossierNom: "Comptabilité", simulation: true },
    });
    expect(garde).toHaveBeenCalledWith(etat.session, "Syndic4@real31.fr", "<m1@x>");
    expect(service).toHaveBeenCalledWith("syndic4@real31.fr", "<m1@x>", "mylene.pin@real31.fr");
    expect(oublier).toHaveBeenCalledWith("g1");
  });

  it("mail non distribué au binôme (ou boîte perso) : refus, rien ne bouge", async () => {
    etat.partagee = null;
    const r = await envoyerEnComptabiliteAction("<m1@x>", "syndic2@real31.fr");
    expect(r).toEqual({ ok: false, erreur: expect.stringContaining("distribué à ton binôme") });
    expect(service).not.toHaveBeenCalled();
  });

  it("non connecté ou données invalides : refus", async () => {
    expect((await envoyerEnComptabiliteAction("", "syndic4@real31.fr")).ok).toBe(false);
    etat.session = null;
    expect(await envoyerEnComptabiliteAction("<m1@x>", "syndic4@real31.fr")).toEqual({ ok: false, erreur: "Non connecté." });
    expect(service).not.toHaveBeenCalled();
  });

  it("refus du service (déjà en Comptabilité) : message lisible, pastille inchangée", async () => {
    etat.erreurService = new Error("Ce mail est déjà en Comptabilité.");
    const r = await envoyerEnComptabiliteAction("<m1@x>", "syndic4@real31.fr");
    expect(r.ok).toBe(false);
    expect(oublier).not.toHaveBeenCalled();
  });
});
