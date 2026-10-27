import { describe, expect, it } from "vitest";
import { decouperHistorique } from "./mes-emails-historique";

// Le texte cité tel que historiqueDuMail le rend (déjà coupé après le message du jour).

describe("decouperHistorique", () => {
  it("découpe un fil Outlook en français, un message par en-tête, dans l'ordre cité", () => {
    const texte = [
      "De : Jean Dupont <jean.dupont@exemple.fr>",
      "Envoyé : lundi 13 octobre 2026 14:05",
      "À : Syndic 2 <syndic2@real31.fr>",
      "Cc : Marie Martin <marie@exemple.fr>",
      "Objet : RE: S247 - Fuite au 3e",
      "",
      "Bonjour,",
      "La fuite continue, pouvez-vous relancer le plombier ?",
      "Cordialement,",
      "Jean",
      "",
      "De : Syndic 2 <syndic2@real31.fr>",
      "Envoyé : vendredi 10 octobre 2026 09:12",
      "À : Jean Dupont <jean.dupont@exemple.fr>",
      "Objet : S247 - Fuite au 3e",
      "",
      "Bonjour, le plombier passe mardi.",
    ].join("\r\n");
    const r = decouperHistorique(texte);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({
      de: "Jean Dupont <jean.dupont@exemple.fr>",
      date: "lundi 13 octobre 2026 14:05",
      a: "Syndic 2 <syndic2@real31.fr>",
      objet: "RE: S247 - Fuite au 3e",
      corps: "Bonjour,\nLa fuite continue, pouvez-vous relancer le plombier ?\nCordialement,\nJean",
    });
    expect(r[1]).toMatchObject({ de: "Syndic 2 <syndic2@real31.fr>", date: "vendredi 10 octobre 2026 09:12", corps: "Bonjour, le plombier passe mardi." });
  });

  it("reconnaît l'en-tête anglais et le séparateur « Original Message »", () => {
    const texte = [
      "-----Original Message-----",
      "From: Ista Support <support@ista.com>",
      "Sent: Monday, October 13, 2026 2:05 PM",
      "To: syndic2@real31.fr",
      "Subject: Meter reading S247",
      "",
      "Hello, the reading is scheduled on Tuesday.",
      "",
      "_____________________________________________",
      "From: syndic2@real31.fr",
      "Date: October 10, 2026",
      "To: support@ista.com",
      "Subject: Meter reading",
      "",
      "When do you plan the reading?",
    ].join("\n");
    const r = decouperHistorique(texte);
    expect(r.map((m) => m.de)).toEqual(["Ista Support <support@ista.com>", "syndic2@real31.fr"]);
    expect(r[0]).toMatchObject({ date: "Monday, October 13, 2026 2:05 PM", a: "syndic2@real31.fr", objet: "Meter reading S247", corps: "Hello, the reading is scheduled on Tuesday." });
    expect(r[1]).toMatchObject({ date: "October 10, 2026", corps: "When do you plan the reading?" });
  });

  it("lit « Le … a écrit : » (Gmail, Apple Mail) et retire les chevrons de citation", () => {
    const texte = [
      "Le lun. 13 oct. 2026 à 14:05, Marie Martin <marie@exemple.fr> a écrit :",
      "> Bonjour,",
      "> Le devis est validé.",
      ">",
      "> Le 10 oct. 2026 à 09:12, Syndic 2 <syndic2@real31.fr> a écrit :",
      "> > Voici le devis en pièce jointe.",
    ].join("\n");
    const r = decouperHistorique(texte);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ de: "Marie Martin <marie@exemple.fr>", date: "lun. 13 oct. 2026 à 14:05", a: null, objet: null, corps: "Bonjour,\nLe devis est validé." });
    expect(r[1]).toEqual({ de: "Syndic 2 <syndic2@real31.fr>", date: "10 oct. 2026 à 09:12", a: null, objet: null, corps: "Voici le devis en pièce jointe." });
  });

  it("garde le texte qui précède le premier en-tête comme un message sans en-tête (fil imbriqué)", () => {
    const texte = [
      "Pour info, voir ci-dessous.",
      "",
      "De : Entreprise Dupuis <contact@dupuis.fr>",
      "Envoyé : mardi 7 octobre 2026 11:40",
      "À : syndic2@real31.fr",
      "Objet : Intervention S247",
      "",
      "Intervention faite ce matin.",
      "De : rien à voir, c'est une phrase du corps.",
      "",
      "On Mon, Oct 6, 2026 at 9:00 AM syndic2@real31.fr wrote:",
      "> Merci de confirmer la date.",
    ].join("\n");
    const r = decouperHistorique(texte);
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({ de: null, date: null, a: null, objet: null, corps: "Pour info, voir ci-dessous." });
    expect(r[1]).toMatchObject({ de: "Entreprise Dupuis <contact@dupuis.fr>", corps: "Intervention faite ce matin.\nDe : rien à voir, c'est une phrase du corps." });
    expect(r[2]).toEqual({ de: "syndic2@real31.fr", date: "Mon, Oct 6, 2026 at 9:00 AM", a: null, objet: null, corps: "Merci de confirmer la date." });
  });

  it("sans marque reconnue : un seul message sans en-tête ; texte vide : aucun", () => {
    expect(decouperHistorique("Bonjour,\n\n\n\nMerci pour votre retour.  \n")).toEqual([
      { de: null, date: null, a: null, objet: null, corps: "Bonjour,\n\nMerci pour votre retour." },
    ]);
    expect(decouperHistorique("")).toEqual([]);
    expect(decouperHistorique("  \n\n")).toEqual([]);
  });
});
