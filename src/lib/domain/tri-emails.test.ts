import { describe, expect, it } from "vitest";
import {
  AUCUN_BINOME,
  cleDeReference,
  constaterRangement,
  coproDuDossier,
  destinationDe,
  lignesBinomes,
  suggestionSuivie,
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
    "agence@gestion-locative.fr": [{ reference: "SE999", qualite: "mandataire" }],
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

  it("reconnait un mandataire de coproprietaire", () => {
    expect(suggererCopro(mail({ deAdresse: "agence@gestion-locative.fr" }), REF).raison).toBe(
      "Adresse connue dans ESTALE : mandataire d'un copropriétaire de SE999.",
    );
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

const CLARA = { nomComplet: "Clara", email: "clara@real31.fr" };
const NADIA = { nomComplet: "Nadia", email: "nadia@real31.fr" };
const binome = (id: string, assistant: { nomComplet: string; email: string }, principal: boolean, g = "sophie@real31.fr") => ({
  id,
  gestionnaireEmail: g,
  assistant,
  principal,
});

describe("destinationDe", () => {
  const ini = { "sophie@real31.fr": "SK", "clara@real31.fr": "CP", "nadia@real31.fr": "NF" };

  it("range dans le dossier du binome principal", () => {
    const d = destinationDe(copro("S0297", "Sophie@real31.fr"), ini, { binomes: [binome("b1", CLARA, true)], parCopro: {} });
    expect(d?.dossier).toBe("Boîte de réception › SK-CP");
    expect(d?.cle).toBe("binome:sophie@real31.fr");
  });

  it("une copro affectee a un autre assistant part dans son dossier, avec sa propre cle", () => {
    const b = { binomes: [binome("b1", CLARA, true), binome("b2", NADIA, false)], parCopro: { S0305: "b2" } };
    expect(destinationDe(copro("S0297", "sophie@real31.fr"), ini, b)?.nomDossier).toBe("SK-CP");
    const d = destinationDe(copro("S0305", "sophie@real31.fr"), ini, b);
    expect(d?.nomDossier).toBe("SK-NF");
    expect(d?.cle).toBe("binome:b2");
  });

  it("ignore l'affectation vers le binome d'un autre gestionnaire", () => {
    const b = { binomes: [binome("b9", NADIA, false, "autre@real31.fr")], parCopro: { S0297: "b9" } };
    expect(destinationDe(copro("S0297", "sophie@real31.fr"), ini, b)?.nomDossier).toBe("SK");
  });

  it("le binome de l'intranet passe devant l'assistant d'ESTALE", () => {
    const c = { ...copro("S0297", "sophie@real31.fr"), assistant: NADIA };
    expect(destinationDe(c, ini)?.nomDossier).toBe("SK-NF");
    expect(destinationDe(c, ini, { binomes: [binome("b1", CLARA, true)], parCopro: {} })?.nomDossier).toBe("SK-CP");
  });

  it("sans assistant, le dossier porte le seul gestionnaire et garde la meme cle", () => {
    const d = destinationDe(copro("S0297", "sophie@real31.fr"), ini);
    expect(d?.nomDossier).toBe("SK");
    expect(d?.cle).toBe("binome:sophie@real31.fr");
  });

  it("sans initiales connues, pas de dossier", () => {
    expect(destinationDe(copro("S0297"), {})?.dossier).toBeNull();
  });

  it("sans gestionnaire au mandat, pas de destination", () => {
    expect(destinationDe({ ...copro("S0297"), gestionnaire: null }, {})).toBeNull();
  });
});

describe("suggestionSuivie", () => {
  it("compare la copro choisie a la premiere candidate", () => {
    expect(suggestionSuivie({ coproReference: "S0297", candidats: ["S0297"] })).toBe(true);
    expect(suggestionSuivie({ coproReference: "S0305", candidats: ["S0297", "S0305"] })).toBe(false);
    expect(suggestionSuivie({ coproReference: null, candidats: ["S0297"] })).toBe(false);
    expect(suggestionSuivie({ coproReference: "S0297", candidats: [] })).toBeNull();
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

describe("lignesBinomes", () => {
  const ini = { "sandy@real31.fr": "SC", "julie@real31.fr": "JB", "galiano@real31.fr": "GG", "sekou@real31.fr": "SK", "remi@real31.fr": "RB" };
  const GALIANO = { nomComplet: "Galiano", email: "galiano@real31.fr" };
  const JULIE = { nomComplet: "Julie", email: "julie@real31.fr" };

  it("une ligne par gestionnaire : principal, autres assistants, copros et affectations", () => {
    const copros = [copro("S0305", "sandy@real31.fr"), copro("S0297", "Sandy@real31.fr"), copro("SE999", "sekou@real31.fr")];
    const b = {
      binomes: [binome("g", GALIANO, true, "sandy@real31.fr"), binome("j", JULIE, false, "sandy@real31.fr")],
      parCopro: { S0305: "j" },
    };
    const lignes = lignesBinomes([], copros, b, ini);
    expect(lignes).toHaveLength(2);
    const sandy = lignes.find((l) => l.gestionnaire.email.toLowerCase() === "sandy@real31.fr")!;
    expect(sandy.principal?.nomDossier).toBe("SC-GG");
    expect(sandy.autres.map((x) => x.nomDossier)).toEqual(["SC-JB"]);
    expect(sandy.copros).toEqual([
      { reference: "S0297", nom: "Copro S0297", binomeId: null },
      { reference: "S0305", nom: "Copro S0305", binomeId: "j" },
    ]);
    expect(lignes.find((l) => l.copros.some((c) => c.reference === "SE999"))?.nomDossierSeul).toBe("SK");
  });

  it("liste aussi les gestionnaires sans copro ESTALE, pour poser leur binome a l'avance", () => {
    const lignes = lignesBinomes([{ nomComplet: "Rémi", email: "Remi@real31.fr" }], [], AUCUN_BINOME, ini);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ copros: [], principal: null, nomDossierSeul: "RB" });
  });
});

describe("constaterRangement", () => {
  const dossiers = [
    { cle: "binome:sandy@real31.fr", folderId: "f-sc", nom: "SC-GG" },
    { cle: "binome:b2", folderId: "f-jb", nom: "SC-JB" },
    { cle: "divers", folderId: "f-div", nom: "Divers" },
  ];
  it("reconnait chaque situation", () => {
    expect(constaterRangement("binome:sandy@real31.fr", { folderId: "f-sc", enReception: false }, dossiers)).toEqual({ cas: "en-place" });
    expect(constaterRangement("binome:sandy@real31.fr", { folderId: "inbox", enReception: true }, dossiers)).toEqual({ cas: "remis-en-reception" });
    expect(constaterRangement("binome:sandy@real31.fr", { folderId: "f-jb", enReception: false }, dossiers)).toEqual({
      cas: "deplace",
      vers: dossiers[1],
    });
    expect(constaterRangement("binome:sandy@real31.fr", { folderId: "f-inconnu", enReception: false }, dossiers)).toEqual({ cas: "introuvable" });
    expect(constaterRangement("binome:sandy@real31.fr", null, dossiers)).toEqual({ cas: "introuvable" });
  });
});

describe("coproDuDossier", () => {
  const ini = { "sandy@real31.fr": "SC", "sekou@real31.fr": "SK" };
  it("deduit la copro quand le dossier n'en recoit qu'une, sinon rien", () => {
    const copros = [copro("S0297", "sandy@real31.fr"), copro("SE999", "sekou@real31.fr"), copro("S0300", "sekou@real31.fr")];
    expect(coproDuDossier("binome:sandy@real31.fr", copros, ini, AUCUN_BINOME)).toBe("S0297");
    expect(coproDuDossier("binome:sekou@real31.fr", copros, ini, AUCUN_BINOME)).toBeNull();
    expect(coproDuDossier("divers", copros, ini, AUCUN_BINOME)).toBeNull();
  });
});
