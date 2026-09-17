import { describe, expect, it } from "vitest";
import { destinatairesDeReponse, dossierOutlookSuggere, phraseRecommandation, sujetDeReponse } from "./mes-emails";

// Les regles de la reponse a un mail vivaient dans 1 500 lignes de JSX, sans test.

describe("sujetDeReponse", () => {
  it("prefixe Re: sauf si l'objet est deja une reponse ou un transfert", () => {
    expect(sujetDeReponse({ objet: "Fuite au 3e" })).toBe("Re: Fuite au 3e");
    for (const o of ["Re: Fuite", "RE : Fuite", "Ré: Fuite", "TR: Fuite", "Fwd: Fuite", "FW: Fuite", "  re:x"]) {
      expect(sujetDeReponse({ objet: o })).toBe(o);
    }
  });
});

describe("destinatairesDeReponse", () => {
  it("repond a l'expediteur, garde les autres en copie sans doublon ni l'expediteur lui-meme", () => {
    const d = destinatairesDeReponse({
      expediteurEmail: "Jean@Example.test",
      destinataires: ["sekou@real31.fr", " jean@example.test ", "pas-un-email"],
      copie: ["sekou@real31.fr", "elsa@real31.fr"],
    });
    expect(d).toEqual({ to: ["Jean@Example.test"], cc: ["sekou@real31.fr", "elsa@real31.fr"], cci: [] });
  });
  it("sans expediteur lisible : personne en A", () => {
    expect(destinatairesDeReponse({ expediteurEmail: "", destinataires: [], copie: [] })).toEqual({ to: [], cc: [], cci: [] });
  });
});

describe("dossierOutlookSuggere", () => {
  const dossiers = [
    { id: "d1", nom: "S072 - Les Tilleuls", niveau: 1 },
    { id: "d2", nom: "Résidence du Parc", niveau: 1 },
    { id: "d3", nom: "Spam", niveau: 0 },
  ];
  it("le code de la copro d'abord, le nom ensuite (4 caracteres minimum), sinon rien", () => {
    expect(dossierOutlookSuggere({ coproCode: "s072", coproNom: "Autre" }, dossiers)).toBe("d1");
    expect(dossierOutlookSuggere({ coproCode: "S999", coproNom: "du Parc" }, dossiers)).toBe("d2");
    expect(dossierOutlookSuggere({ coproCode: "", coproNom: "Par" }, dossiers)).toBe("");
    expect(dossierOutlookSuggere({ coproCode: "S999", coproNom: "Inconnue" }, dossiers)).toBe("");
  });
});

describe("phraseRecommandation", () => {
  it("dit a qui repondre et ou classer, selon le rattachement et le brouillon", () => {
    const m = { ticketable: true, de: "M. Bardet (copropriétaire)", brouillonReponse: "Bonjour…" };
    expect(phraseRecommandation(m, { statut: "existant", dossierLabel: "Fuite 3e" })).toBe("Répondre à M. Bardet et classer dans le dossier « Fuite 3e ».");
    expect(phraseRecommandation({ ...m, brouillonReponse: undefined }, { statut: "nouveau", dossierLabel: "Fuite 3e" })).toBe("Traiter et classer dans un nouveau dossier « Fuite 3e ».");
    expect(phraseRecommandation({ ...m, ticketable: false }, { statut: "nouveau", dossierLabel: "x" })).toBe("Aucune action requise - à classer pour information.");
  });
});
