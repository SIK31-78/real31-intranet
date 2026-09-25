import { describe, expect, it } from "vitest";
import {
  cleDeReference,
  destinationDe,
  estAssistantDeCopro,
  referencesCitees,
  suggererCopro,
  type CoproTri,
  type ReferentielTri,
} from "./tri-emails";

const copro = (reference: string, gestionnaire = "g@real31.fr"): CoproTri => ({
  reference,
  nom: `Copro ${reference}`,
  adresse: "",
  gestionnaire: { nomComplet: "Gestionnaire", email: gestionnaire },
  assistant: null,
});

const REF: ReferentielTri = {
  copros: [copro("S0297"), copro("S0305"), copro("SE999")],
  expediteurs: {
    "proprio@exemple.fr": [{ reference: "S0297", qualite: "copropriétaire" }],
    "president@exemple.fr": [
      { reference: "S0305", qualite: "conseil syndical" },
      { reference: "S0305", qualite: "copropriétaire" },
    ],
    "devis@plombier.fr": [
      { reference: "S0297", qualite: "fournisseur" },
      { reference: "S0305", qualite: "fournisseur" },
    ],
  },
};

const mail = (p: Partial<{ deAdresse: string; objet: string; apercu: string }>) => ({
  deAdresse: "inconnu@exemple.fr",
  objet: "Bonjour",
  apercu: "",
  ...p,
});

describe("references", () => {
  it("compare S0297 et S297 comme la meme copro", () => {
    expect(cleDeReference("S0297")).toBe("S297");
    expect(referencesCitees("RE: [S297] ODJ")).toEqual(["S297"]);
    expect(cleDeReference("SE999")).toBe("SE999");
  });

  it("ignore ce qui ressemble a une reference sans en etre une", () => {
    expect(referencesCitees("Parking S1, bâtiment S 12, RS02971")).toEqual([]);
  });

  it("dedoublonne en gardant l'ordre", () => {
    expect(referencesCitees("S0305 puis S0297 puis S305")).toEqual(["S305", "S297"]);
  });
});

describe("suggererCopro", () => {
  it("prend le code de l'objet en premier, meme si l'expediteur pointe ailleurs", () => {
    const s = suggererCopro(mail({ objet: "RE: [S0305] ODJ", deAdresse: "proprio@exemple.fr" }), REF);
    expect(s).toMatchObject({ nature: "sure", candidats: ["S0305"] });
    expect(s.raison).toBe("Code S0305 cité dans l'objet.");
  });

  it("reconnait un expediteur connu d'une seule copro, sans tenir compte de la casse", () => {
    const s = suggererCopro(mail({ deAdresse: "Proprio@Exemple.fr" }), REF);
    expect(s).toMatchObject({ nature: "sure", candidats: ["S0297"] });
    expect(s.raison).toBe("Adresse connue dans ESTALE : copropriétaire de S0297.");
  });

  it("un expediteur deux fois sur la meme copro reste une suggestion sure", () => {
    expect(suggererCopro(mail({ deAdresse: "president@exemple.fr" }), REF).candidats).toEqual(["S0305"]);
  });

  it("laisse choisir quand l'expediteur est sur plusieurs copros", () => {
    const s = suggererCopro(mail({ deAdresse: "devis@plombier.fr" }), REF);
    expect(s.nature).toBe("plusieurs");
    expect(s.candidats).toEqual(["S0297", "S0305"]);
  });

  it("un code dans le corps n'est qu'un indice faible", () => {
    expect(suggererCopro(mail({ apercu: "Concernant SE999, merci" }), REF)).toMatchObject({
      nature: "faible",
      candidats: ["SE999"],
    });
  });

  it("signale une copro citee qui n'est pas sur ESTALE", () => {
    const s = suggererCopro(mail({ objet: "Résiliation s0142" }), REF);
    expect(s).toMatchObject({ nature: "hors-estale", candidats: [] });
    expect(s.raison).toBe("Code S0142 cité, mais cette copropriété n'est pas sur ESTALE.");
  });

  it("ne propose rien sans indice", () => {
    expect(suggererCopro(mail({}), REF)).toMatchObject({ nature: "aucune", candidats: [] });
  });
});

describe("destinationDe", () => {
  it("range dans le dossier aux initiales du gestionnaire", () => {
    const d = destinationDe(copro("S0297", "Sophie@real31.fr"), { "sophie@real31.fr": "SK" });
    expect(d?.dossier).toBe("Boîte de réception › SK");
  });

  it("sans initiales connues, pas de dossier", () => {
    expect(destinationDe(copro("S0297"), {})?.dossier).toBeNull();
  });

  it("sans gestionnaire au mandat, pas de destination", () => {
    expect(destinationDe({ ...copro("S0297"), gestionnaire: null }, {})).toBeNull();
  });
});

describe("estAssistantDeCopro", () => {
  it("ne retient que les assistants de copropriete (intitules reels ESTALE)", () => {
    expect(estAssistantDeCopro("Assistant de copropriété")).toBe(true);
    expect(estAssistantDeCopro("Assistante de copropriété")).toBe(true);
    expect(estAssistantDeCopro("Assistante commerciale")).toBe(false);
    expect(estAssistantDeCopro("Assistant comptable")).toBe(false);
    expect(estAssistantDeCopro(null)).toBe(false);
  });
});
