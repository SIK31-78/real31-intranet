import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// « Transférer » depuis le tri (REA-500, 06/11/2026) : gardes de l'action (droit de trier la
// boîte, incarnation, écriture coupée, collègues REAL31 seulement, mail encore en réception),
// ordre transfert puis rangement dans « Transférés », brouillon quand l'interrupteur est
// coupé, avertissement quand le rangement échoue après le départ. La session et les services
// (Graph, journal, notes) sont doublés ; la config des boîtes et les interrupteurs sont réels.

const etat = vi.hoisted(() => ({
  session: null as { id: string; nomComplet: string; initiales: string; email?: string } | null,
  incarnation: false,
  simulation: false,
  enReception: true as boolean,
  dejaRange: false,
  ordre: [] as string[],
}));

const services = vi.hoisted(() => ({
  transfererMail: vi.fn(async () => {
    etat.ordre.push("transfert");
    return {};
  }),
  rangerMail: vi.fn(async () => {
    etat.ordre.push("rangement");
    return { journalId: "j-1", dossierNom: "Transférés", simulation: false, etiquetteNonPosee: false };
  }),
  ajouterNoteMail: vi.fn(async () => {
    etat.ordre.push("note");
    return {};
  }),
  oublierCompteur: vi.fn(() => {
    etat.ordre.push("compteur");
  }),
  lireEnReception: vi.fn(async () => (etat.enReception ? { internetMessageId: "<mail-1@exemple.fr>", expediteur: "client@exemple.fr", objet: "Visite" } : null)),
  dejaRanges: vi.fn(async (_b: string, ids: string[]) => new Set(etat.dejaRange ? ids : [])),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/observabilite", () => ({ tracer: vi.fn(), signaler: vi.fn(), signalerException: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
  incarnationEnCours: async () => etat.incarnation,
}));
vi.mock("@/lib/services/tri-emails/ranger", () => ({
  depsParDefaut: (config: { boite: string }) => ({
    boite: config.boite,
    simulation: etat.simulation,
    rangement: { lireEnReception: services.lireEnReception },
    repo: { dejaRanges: services.dejaRanges },
  }),
  rangerMail: services.rangerMail,
  annulerRangement: vi.fn(),
  preciserCopro: vi.fn(),
  supprimerMail: vi.fn(),
}));
vi.mock("@/lib/services/tri-emails/compteur", () => ({ oublierCompteur: services.oublierCompteur }));
vi.mock("@/lib/services/mes-emails/boite-equipe", () => ({ ajouterNoteMail: services.ajouterNoteMail }));
vi.mock("@/lib/services/mes-emails/transferer", () => ({ transfererMail: services.transfererMail }));
vi.mock("@/lib/services/mes-emails/get-signature", () => ({ getSignatureGestionnaire: async () => "<p>Signature</p>" }));
vi.mock("@/lib/services/tri-emails/binomes", () => ({}));
vi.mock("@/lib/services/tri-emails/pieces-jointes", () => ({}));
vi.mock("@/lib/services/tri-emails/copro-pieces-jointes", () => ({}));
vi.mock("@/lib/services/tri-emails/basculer", () => ({}));
vi.mock("@/lib/services/tri-emails/reaffecter", () => ({}));
vi.mock("@/lib/services/mes-emails/historique-mail", () => ({}));

import { transfererMailTriAction } from "./actions";

const BOITE = "syndic2@real31.fr";
const superAdmin = { id: "u1", nomComplet: "Camille TEST", initiales: "CT", email: "camille@real31.fr" };
const horsAgence = { id: "u2", nomComplet: "Dominique TEST", initiales: "DT", email: "dominique@real31.fr" };

const saisie = {
  boite: BOITE,
  messageId: "graph-1",
  internetMessageId: "<mail-1@exemple.fr>",
  expediteur: "client@exemple.fr",
  objet: "Visite",
  suggestion: null,
  a: ["vente@real31.fr"],
  cc: ["location@real31.fr"],
  corps: "Pour toi.",
};

beforeEach(() => {
  vi.stubEnv("SUPER_ADMINS", "camille@real31.fr");
  vi.stubEnv("MAIL_TRI_BOITES", "");
  vi.stubEnv("MAIL_BOITE_TRI", BOITE);
  vi.stubEnv("MAIL_TRI_ECRITURE", "on");
  vi.stubEnv("MAIL_ENVOI", "");
  vi.stubEnv("MAIL_TRI_TRANSFERT", "on");
  etat.session = superAdmin;
  etat.incarnation = false;
  etat.simulation = false;
  etat.enReception = true;
  etat.dejaRange = false;
  etat.ordre = [];
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const rienFait = () => {
  expect(services.transfererMail).not.toHaveBeenCalled();
  expect(services.rangerMail).not.toHaveBeenCalled();
  expect(services.ajouterNoteMail).not.toHaveBeenCalled();
};

describe("transfererMailTriAction", () => {
  it("transfère depuis la boîte triée, puis range dans « Transférés » et laisse la trace", async () => {
    const r = await transfererMailTriAction(saisie);
    expect(r).toEqual({ ok: true, donnees: { envoye: true, journalId: "j-1", dossierNom: "Transférés" } });
    expect(etat.ordre).toEqual(["transfert", "rangement", "compteur", "note"]);
    expect(services.transfererMail).toHaveBeenCalledWith({
      boite: BOITE,
      internetMessageId: "<mail-1@exemple.fr>",
      a: ["vente@real31.fr"],
      cc: ["location@real31.fr"],
      corps: "Pour toi.",
      signatureHtml: "<p>Signature</p>",
      envoyer: true,
    });
    expect(services.rangerMail).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "graph-1", internetMessageId: "<mail-1@exemple.fr>", cible: { type: "transferes" } }),
      "camille@real31.fr",
      expect.objectContaining({ boite: BOITE }),
    );
    expect(services.oublierCompteur).toHaveBeenCalledWith(BOITE);
    expect(services.ajouterNoteMail).toHaveBeenCalledWith(
      superAdmin,
      BOITE,
      "<mail-1@exemple.fr>",
      "Transféré à vente@real31.fr (Cc : location@real31.fr) par Camille TEST.",
    );
  });

  it("refuse hors de l'agence de la boîte, sans rien faire", async () => {
    etat.session = horsAgence;
    const r = await transfererMailTriAction(saisie);
    expect(r).toEqual({ ok: false, erreur: "Le tri de cette boîte est réservé à l'équipe syndic de son agence." });
    expect(services.lireEnReception).not.toHaveBeenCalled();
    rienFait();
  });

  it("refuse une adresse hors REAL31, en À comme en Cc", async () => {
    const r = await transfererMailTriAction({ ...saisie, cc: ["client@exemple.fr"] });
    expect(r).toEqual({
      ok: false,
      erreur: "Depuis le tri, un mail ne se transfère qu'aux collègues REAL31 (adresses @real31.fr) : « client@exemple.fr » est refusée.",
    });
    expect((await transfererMailTriAction({ ...saisie, a: ["vente@real31.fr.exemple.fr"] })).ok).toBe(false);
    rienFait();
  });

  it("refuse plus de 50 destinataires", async () => {
    const a = Array.from({ length: 40 }, (_, i) => `c${i}@real31.fr`);
    const cc = Array.from({ length: 11 }, (_, i) => `d${i}@real31.fr`);
    expect(await transfererMailTriAction({ ...saisie, a, cc })).toEqual({ ok: false, erreur: "Trop de destinataires (50 maximum)." });
    rienFait();
  });

  it("refuse en incarnation", async () => {
    etat.incarnation = true;
    const r = await transfererMailTriAction(saisie);
    expect(r).toMatchObject({ ok: false, erreur: expect.stringContaining("incarnation") });
    rienFait();
  });

  it("refuse quand l'écriture du tri est coupée : pas de transfert simulé", async () => {
    vi.stubEnv("MAIL_TRI_ECRITURE", "");
    const r = await transfererMailTriAction(saisie);
    expect(r).toEqual({ ok: false, erreur: `L'écriture du tri est coupée sur ${BOITE} : pas de transfert depuis le tri (rien n'a été fait).` });
    vi.stubEnv("MAIL_TRI_ECRITURE", "on");
    etat.simulation = true; // MAIL_SOURCE autre que graph : rangement simulé
    expect((await transfererMailTriAction(saisie)).ok).toBe(false);
    rienFait();
  });

  it("ne transfère pas un mail qui n'est plus en réception, ou déjà rangé", async () => {
    etat.enReception = false;
    expect(await transfererMailTriAction(saisie)).toMatchObject({ ok: false, erreur: expect.stringContaining("plus dans la boîte de réception") });
    etat.enReception = true;
    etat.dejaRange = true;
    expect(await transfererMailTriAction(saisie)).toEqual({ ok: false, erreur: "Ce mail a déjà été rangé : rien n'a été transféré." });
    rienFait();
  });

  it("interrupteur coupé et envoi fermé : brouillon Outlook, le mail reste dans la file", async () => {
    vi.stubEnv("MAIL_TRI_TRANSFERT", "");
    const r = await transfererMailTriAction(saisie);
    expect(r).toEqual({ ok: true, donnees: { envoye: false } });
    expect(services.transfererMail).toHaveBeenCalledWith(expect.objectContaining({ envoyer: false }));
    expect(services.rangerMail).not.toHaveBeenCalled();
    expect(services.ajouterNoteMail).not.toHaveBeenCalled();
  });

  it("interrupteur coupé mais envoi ouvert sur la boîte : il part et le mail est rangé", async () => {
    vi.stubEnv("MAIL_TRI_TRANSFERT", "");
    vi.stubEnv("MAIL_ENVOI", "on");
    const r = await transfererMailTriAction(saisie);
    expect(r).toMatchObject({ ok: true, donnees: { envoye: true, journalId: "j-1" } });
    expect(services.transfererMail).toHaveBeenCalledWith(expect.objectContaining({ envoyer: true }));
  });

  it("transfert en panne : rien n'est rangé", async () => {
    services.transfererMail.mockRejectedValueOnce(new Error("Graph createForward 500 : panne"));
    const r = await transfererMailTriAction(saisie);
    expect(r.ok).toBe(false);
    expect(services.rangerMail).not.toHaveBeenCalled();
    expect(services.ajouterNoteMail).not.toHaveBeenCalled();
  });

  it("parti mais pas rangé : ok, avec un avertissement lisible, et la trace quand même", async () => {
    services.rangerMail.mockRejectedValueOnce(new Error("Ce mail a déjà été rangé."));
    const r = await transfererMailTriAction(saisie);
    expect(r).toEqual({
      ok: true,
      donnees: { envoye: true, avertissement: "Mail transféré, mais pas rangé : range-le à la main. (Ce mail a déjà été rangé.)" },
    });
    expect(services.ajouterNoteMail).toHaveBeenCalled();
    expect(services.oublierCompteur).toHaveBeenCalledWith(BOITE);
  });

  it("une panne technique du rangement n'expose pas le message brut", async () => {
    services.rangerMail.mockRejectedValueOnce(new Error("PGRST116 relation does not exist"));
    const r = await transfererMailTriAction(saisie);
    expect(r).toMatchObject({ ok: true, donnees: { envoye: true, avertissement: expect.stringContaining("Mail transféré, mais pas rangé") } });
    expect(JSON.stringify(r)).not.toContain("PGRST");
  });

  it("la note qui échoue n'annule rien : avertissement seulement", async () => {
    services.ajouterNoteMail.mockRejectedValueOnce(new Error("Les notes internes ne sont pas encore disponibles."));
    const r = await transfererMailTriAction(saisie);
    expect(r).toEqual({
      ok: true,
      donnees: {
        envoye: true,
        journalId: "j-1",
        dossierNom: "Transférés",
        avertissement: "La trace « transféré à » n'a pas été notée sur le mail : Les notes internes ne sont pas encore disponibles.",
      },
    });
  });
});
