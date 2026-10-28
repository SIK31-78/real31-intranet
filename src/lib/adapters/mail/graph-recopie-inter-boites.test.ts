import { describe, expect, it } from "vitest";
import { DRAPEAUX_NON_BROUILLON, PROP, PROP_RECOPIE, messageDeLaCopie, nomCopie, repartirPieces, type MessageSource } from "./graph-recopie-inter-boites";

// Forme relue sur syndic4 le 28/10/2026 (lecture seule) : Graph rend les ids des propriétés
// étendues raccourcis (« Binary 0x71 », « String 0x1042 »).
const source: MessageSource = {
  subject: "RE: Fuite S0109",
  body: { contentType: "html", content: "<p>Bonjour</p><img src=\"cid:image001.png@01\">" },
  from: { emailAddress: { name: "Mme X", address: "x@gmail.com" } },
  sender: { emailAddress: { name: "Mme X", address: "x@gmail.com" } },
  toRecipients: [{ emailAddress: { name: "Syndic 4", address: "syndic4@real31.fr" } }],
  ccRecipients: [{ emailAddress: { address: "cs@exemple.fr" } }, { emailAddress: {} }],
  replyTo: [],
  importance: "high",
  receivedDateTime: "2026-10-27T13:49:25Z",
  sentDateTime: "2026-10-27T13:39:17Z",
  internetMessageId: "<abc@mail.gmail.com>",
  conversationIndex: "AQHaWPr0swVCcDgKAEKtwgnFmP+Nk7D9UcyA",
  singleValueExtendedProperties: [
    { id: "String 0x1042", value: "<parent@office365.com>" },
    { id: "String 0x1039", value: "<a@x> <parent@office365.com>" },
  ],
};

const prop = (corps: Record<string, unknown>, id: string) =>
  (corps.singleValueExtendedProperties as { id: string; value: string }[]).find((p) => p.id === id)?.value;

describe("messageDeLaCopie : un mail reçu, pas un brouillon", () => {
  const corps = messageDeLaCopie(source, "Syndic4@real31.fr");

  it("pose PR_MESSAGE_FLAGS sans MSGFLAG_UNSENT à la création (sinon brouillon)", () => {
    expect(prop(corps, PROP.drapeaux)).toBe(DRAPEAUX_NON_BROUILLON);
    expect(Number(DRAPEAUX_NON_BROUILLON) & 0x8).toBe(0);
  });

  it("garde les dates d'origine (réception et envoi)", () => {
    expect(prop(corps, PROP.livraison)).toBe("2026-10-27T13:49:25Z");
    expect(prop(corps, PROP.soumission)).toBe("2026-10-27T13:39:17Z");
  });

  it("garde le fil : internetMessageId, In-Reply-To, References, index de conversation", () => {
    expect(corps.internetMessageId).toBe("<abc@mail.gmail.com>");
    expect(prop(corps, PROP.enReponseA)).toBe("<parent@office365.com>");
    expect(prop(corps, PROP.references)).toBe("<a@x> <parent@office365.com>");
    expect(prop(corps, PROP.indexConversation)).toBe("AQHaWPr0swVCcDgKAEKtwgnFmP+Nk7D9UcyA");
  });

  it("marque la copie (boîte de départ) pour ne jamais effacer un vrai mail", () => {
    expect(prop(corps, PROP_RECOPIE)).toBe("syndic4@real31.fr");
  });

  it("expéditeur, destinataires, objet, corps, importance à l'identique ; adresse vide écartée", () => {
    expect(corps.subject).toBe("RE: Fuite S0109");
    expect(corps.body).toEqual({ contentType: "html", content: source.body!.content });
    expect(corps.from).toEqual({ emailAddress: { name: "Mme X", address: "x@gmail.com" } });
    expect(corps.toRecipients).toEqual([{ emailAddress: { name: "Syndic 4", address: "syndic4@real31.fr" } }]);
    expect(corps.ccRecipients).toEqual([{ emailAddress: { name: "", address: "cs@exemple.fr" } }]);
    expect(corps.importance).toBe("high");
  });

  it("jamais d'accusé de lecture ou de remise demandé depuis la copie", () => {
    expect(corps.isReadReceiptRequested).toBe(false);
    expect(corps.isDeliveryReceiptRequested).toBe(false);
  });

  it("propriétés absentes de l'original : pas posées", () => {
    const nu = messageDeLaCopie({ subject: "x" }, "syndic4@real31.fr");
    const ids = (nu.singleValueExtendedProperties as { id: string }[]).map((p) => p.id);
    expect(ids).toEqual([PROP.drapeaux, PROP_RECOPIE]);
    expect(nu).not.toHaveProperty("internetMessageId");
    expect(nu).not.toHaveProperty("attachments");
  });

  it("lit les ids raccourcis que Graph rend (Binary 0x71 pour 0x0071)", () => {
    const m = { ...source, conversationIndex: null, singleValueExtendedProperties: [{ id: "string 0x1042", value: "<p@x>" }] };
    expect(prop(messageDeLaCopie(m, "s"), PROP.enReponseA)).toBe("<p@x>");
  });

  it("joint les pièces données, contentId et « en ligne » compris", () => {
    const c = messageDeLaCopie(source, "s", [
      { nom: "image001.png", contentType: "image/png", isInline: true, contentId: "image001.png@01", octets: new Uint8Array([1, 2, 3]) },
    ]);
    expect(c.attachments).toEqual([
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: "image001.png",
        contentType: "image/png",
        isInline: true,
        contentId: "image001.png@01",
        contentBytes: "AQID",
      },
    ]);
  });
});

describe("pièces jointes", () => {
  it("un mail joint devient un fichier .eml", () => {
    expect(nomCopie("#microsoft.graph.itemAttachment", "Re: devis")).toBe("Re: devis.eml");
    expect(nomCopie("#microsoft.graph.itemAttachment", "a.eml")).toBe("a.eml");
    expect(nomCopie("#microsoft.graph.fileAttachment", "f.pdf")).toBe("f.pdf");
    expect(nomCopie(undefined, "  ")).toBe("piece-jointe");
  });

  it("dans la requête de création tant qu'elle reste sous 4 Mo ; une pièce de 3 Mo ou plus toujours après", () => {
    const p = (n: number) => ({ octets: new Uint8Array(n) });
    const petit = p(1_000_000);
    const gros = p(3 * 1024 * 1024);
    const r = repartirPieces([petit, gros, petit, petit], 10_000);
    expect(r.jointes).toEqual([petit, petit]);
    expect(r.apres).toEqual([gros, petit]);
  });
});
