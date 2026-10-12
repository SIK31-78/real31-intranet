// Adapter mailing ESTALE (REA-144) : estaleGql est mocké, aucun appel réseau. Le point
// non négociable : AUCUNE requête émise ne doit envoyer le mailing.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { EstaleMailingProvider } from "./estale-mailing-provider";
import { estaleGql } from "./client";
import { resoudreCondoId } from "./condos-accessibles";

vi.mock("./client", () => ({ estaleGql: vi.fn() }));
vi.mock("./condos-accessibles", () => ({ resoudreCondoId: vi.fn() }));

const gql = vi.mocked(estaleGql);
const resoudre = vi.mocked(resoudreCondoId);

const BROUILLON = {
  coproCode: "SE999",
  titre: "SE999 - Annonce AG du 10/12/2026",
  objet: "Prochaine assemblée générale",
  contenuHtml: "<p>Madame, Monsieur,</p>",
  repondreA: "gestionnaire@real31.fr",
};

type Recipient = { resourceID: string; sendingMode: string; acceptModes: string[] };

function scenario(opts: { recipients?: Recipient[]; echecCorps?: boolean; isSent?: boolean } = {}) {
  const recipients = opts.recipients ?? [
    { resourceID: "o1", sendingMode: "MAIL", acceptModes: ["MAIL", "LS"] },
    { resourceID: "o2", sendingMode: "LS", acceptModes: ["MAIL", "LS"] },
    { resourceID: "o3", sendingMode: "LS", acceptModes: ["LS"] },
  ];
  gql.mockImplementation(async (query: string) => {
    if (query.includes("CoproprietairesMailing")) {
      return {
        condo: {
          establishmentID: "etab-1",
          owners: [
            { id: "o1", email: "a@x.fr", canReceiveMail: true },
            { id: "o2", email: "b@x.fr", canReceiveMail: true },
            { id: "o3", email: "c@x.fr", canReceiveMail: true },
            { id: "o4", email: null, canReceiveMail: true },
            { id: "o5", email: "e@x.fr", canReceiveMail: false },
          ],
        },
      } as never;
    }
    if (query.includes("createMailing")) return { createMailing: { id: "m-1", reference: "00042" } } as never;
    if (query.includes("updateMail(") && opts.echecCorps) throw new Error("boom");
    if (query.includes("upsertRecipientsOwner")) {
      return { updateMailing: { upsertRecipientsOwner: { recipients } } } as never;
    }
    if (query.includes("RelireMailing")) {
      return {
        me: {
          collaborator: {
            mailing: {
              item: {
                reference: "00042",
                title: BROUILLON.titre,
                isSent: opts.isSent ?? false,
                nbRecipients: 2,
                channelInfos: { unsentPrice: { total: 0 } },
              },
            },
          },
        },
      } as never;
    }
    return { updateMailing: {} } as never;
  });
}

const requetes = () => gql.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  gql.mockReset();
  resoudre.mockReset();
  resoudre.mockResolvedValue("condo-se999");
});

describe("EstaleMailingProvider.creerBrouillon", () => {
  it("crée un brouillon informatif, objet + corps + réponse au gestionnaire, et ne l'envoie jamais", async () => {
    scenario();
    const r = await new EstaleMailingProvider().creerBrouillon(BROUILLON);

    // Garde absolue : aucune mutation d'envoi, ni l'express (drapeau d'envoi obligatoire).
    for (const q of requetes()) {
      expect(q).not.toMatch(/\bsend\b/);
      expect(q).not.toMatch(/createMailingExpress/);
      expect(q).not.toMatch(/\bprint\b/);
    }

    const vars = (motif: string) => gql.mock.calls.find((c) => (c[0] as string).includes(motif))?.[1];
    expect(vars("createMailing")).toEqual({ input: { establishmentID: "etab-1", title: BROUILLON.titre } });
    expect(vars("CategorieMailing")).toMatchObject({ input: { category: "INFORMATIVE" } });
    expect(vars("CorpsMailing")).toEqual({
      id: "m-1",
      input: { object: BROUILLON.objet, content: BROUILLON.contenuHtml, replyto: "gestionnaire@real31.fr" },
    });
    // Seuls les copropriétaires joignables par e-mail sont ajoutés.
    expect(vars("upsertRecipientsOwner")).toEqual({ id: "m-1", owners: ["o1", "o2", "o3"] });

    expect(r).toEqual({
      mailingId: "m-1",
      reference: "00042",
      titre: BROUILLON.titre,
      destinatairesMail: 2,
      sansEmail: 3, // o4 sans e-mail, o5 refuse le mail, o3 n'accepte pas le mail
      coutEnvoi: 0,
      lien: "https://estale.app/",
    });
  });

  it("passe en MAIL les destinataires postaux qui l'acceptent, retire les autres", async () => {
    scenario();
    await new EstaleMailingProvider().creerBrouillon(BROUILLON);
    const mode = gql.mock.calls.find((c) => (c[0] as string).includes("updateRecipientsMode"));
    expect(mode?.[0]).toContain("mode: MAIL");
    expect(mode?.[1]).toEqual({ id: "m-1", ids: ["o2"] });
    const retrait = gql.mock.calls.find((c) => (c[0] as string).includes("removeRecipients"));
    expect(retrait?.[1]).toEqual({ id: "m-1", ids: ["o3"] });
  });

  it("n'émet ni bascule ni retrait quand tout le monde est déjà en MAIL", async () => {
    scenario({ recipients: [{ resourceID: "o1", sendingMode: "MAIL", acceptModes: ["MAIL"] }] });
    await new EstaleMailingProvider().creerBrouillon(BROUILLON);
    expect(requetes().some((q) => q.includes("updateRecipientsMode"))).toBe(false);
    expect(requetes().some((q) => q.includes("removeRecipients"))).toBe(false);
  });

  it("supprime le brouillon incomplet si une étape échoue après la création", async () => {
    scenario({ echecCorps: true });
    await expect(new EstaleMailingProvider().creerBrouillon(BROUILLON)).rejects.toThrow("boom");
    const suppression = gql.mock.calls.find((c) => (c[0] as string).includes("delete"));
    expect(suppression?.[1]).toEqual({ id: "m-1" });
  });

  it("refuse une copro inconnue d'ESTALE sans rien créer", async () => {
    resoudre.mockResolvedValue(null);
    await expect(new EstaleMailingProvider().creerBrouillon(BROUILLON)).rejects.toThrow(/introuvable dans ESTALE/);
    expect(gql).not.toHaveBeenCalled();
  });

  it("refuse une copro sans aucun e-mail, avant toute création", async () => {
    gql.mockResolvedValueOnce({ condo: { establishmentID: "e", owners: [{ id: "o", email: "", canReceiveMail: true }] } } as never);
    await expect(new EstaleMailingProvider().creerBrouillon(BROUILLON)).rejects.toThrow(/Aucun copropriétaire/);
    expect(requetes().some((q) => q.includes("createMailing"))).toBe(false);
  });

  it("alerte si ESTALE dit le mailing envoyé", async () => {
    scenario({ isSent: true });
    await expect(new EstaleMailingProvider().creerBrouillon(BROUILLON)).rejects.toThrow(/apparaît comme envoyé/);
  });
});
