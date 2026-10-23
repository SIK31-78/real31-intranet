import { describe, expect, it } from "vitest";
import { decouperLiens, libelleCourt } from "./mes-emails-liens";

describe("liens dans le texte d'un mail", () => {
  it("laisse un texte sans lien tel quel", () => {
    expect(decouperLiens("Bonjour,\nRien à signaler.")).toEqual([{ type: "texte", texte: "Bonjour,\nRien à signaler." }]);
    expect(decouperLiens("")).toEqual([]);
  });

  it("rend cliquable une adresse nue, sans la ponctuation qui la suit", () => {
    expect(decouperLiens("Voir https://exemple.fr/devis?id=4. Merci")).toEqual([
      { type: "texte", texte: "Voir " },
      { type: "lien", texte: "https://exemple.fr/devis?id=4", href: "https://exemple.fr/devis?id=4" },
      { type: "texte", texte: ". Merci" },
    ]);
    expect(decouperLiens("(https://exemple.fr)")).toEqual([
      { type: "texte", texte: "(" },
      { type: "lien", texte: "https://exemple.fr", href: "https://exemple.fr" },
      { type: "texte", texte: ")" },
    ]);
  });

  it("rend cliquable un mailto", () => {
    expect(decouperLiens("Écrire à mailto:syndic@exemple.fr")).toEqual([
      { type: "texte", texte: "Écrire à " },
      { type: "lien", texte: "mailto:syndic@exemple.fr", href: "mailto:syndic@exemple.fr" },
    ]);
  });

  it("rend la forme Graph « libellé<url> » : le libellé est cliquable, l'adresse cachée", () => {
    expect(decouperLiens("Télécharger le document<https://exemple.fr/doc/123> avant lundi")).toEqual([
      { type: "texte", texte: "Télécharger le " },
      { type: "lien", texte: "document", href: "https://exemple.fr/doc/123" },
      { type: "texte", texte: " avant lundi" },
    ]);
    expect(decouperLiens("jean.martin@exemple.fr<mailto:jean.martin@exemple.fr>")).toEqual([
      { type: "lien", texte: "jean.martin@exemple.fr", href: "mailto:jean.martin@exemple.fr" },
    ]);
  });

  it("sans libellé, montre l'adresse, raccourcie si elle est longue", () => {
    const longue = `https://exemple.fr/${"a".repeat(80)}`;
    expect(decouperLiens(`Lien : <${longue}>`)).toEqual([
      { type: "texte", texte: "Lien : " },
      { type: "lien", texte: "exemple.fr/…", href: longue },
    ]);
    expect(libelleCourt("https://x.fr")).toBe("https://x.fr");
  });

  it("ne double pas une adresse suivie de sa propre forme Graph", () => {
    expect(decouperLiens("https://exemple.fr<https://exemple.fr>")).toEqual([
      { type: "lien", texte: "https://exemple.fr", href: "https://exemple.fr" },
    ]);
  });

  it("n'accepte que http(s) et mailto", () => {
    expect(decouperLiens("clic<javascript:alert(1)>")).toEqual([{ type: "texte", texte: "clic<javascript:alert(1)>" }]);
    expect(decouperLiens("javascript:alert(1) ftp://x.fr")).toEqual([{ type: "texte", texte: "javascript:alert(1) ftp://x.fr" }]);
    expect(decouperLiens("https:// rien")).toEqual([{ type: "texte", texte: "https:// rien" }]);
  });
});
