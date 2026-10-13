import { describe, expect, it } from "vitest";
import { destinatairesDeReponse, dossierOutlookSuggere, grouperDossiersBoite, nomDossierCopro, phraseRecommandation, sujetDeReponse } from "./mes-emails";

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
  it("le code de la copro d'abord, le nom ensuite (5 caracteres minimum, sans accents), sinon rien", () => {
    expect(dossierOutlookSuggere({ coproCode: "s072", coproNom: "Autre" }, dossiers)).toBe("d1");
    expect(dossierOutlookSuggere({ coproCode: "S999", coproNom: "du Parc" }, dossiers)).toBe("d2");
    expect(dossierOutlookSuggere({ coproCode: "S999", coproNom: "residence DU parc" }, dossiers)).toBe("d2");
    expect(dossierOutlookSuggere({ coproCode: "", coproNom: "Parc" }, dossiers)).toBe("");
    expect(dossierOutlookSuggere({ coproCode: "S999", coproNom: "Inconnue" }, dossiers)).toBe("");
  });
  it("reconnait le code quelle que soit son ecriture, sans confondre S270 et S2700", () => {
    const d = [
      { id: "a", nom: "S2700 - Autre", niveau: 1 },
      { id: "b", nom: "S270 - 34 rue de Vaugirard - 75015", niveau: 1 },
    ];
    expect(dossierOutlookSuggere({ coproCode: "S0270", coproNom: "x" }, d)).toBe("b");
    expect(dossierOutlookSuggere({ coproCode: "S2700", coproNom: "x" }, d)).toBe("a");
  });
});

describe("nomDossierCopro", () => {
  it("code - nom, sans caracteres interdits par Outlook", () => {
    expect(nomDossierCopro("S270", "Le Cyrano")).toBe("S270 - Le Cyrano");
    expect(nomDossierCopro("S270", "A/B : C")).toBe("S270 - A B C");
    expect(nomDossierCopro("S270", "")).toBe("S270");
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

describe("grouperDossiersBoite", () => {
  it("met les sous-dossiers de la réception d'abord, retire les dossiers système, trie en français", () => {
    const g = grouperDossiersBoite([
      { id: "1", nom: "Éléments supprimés", niveau: 0 },
      { id: "2", nom: "SK-CP", niveau: 1 },
      { id: "3", nom: "Comptabilité", niveau: 1 },
      { id: "4", nom: "Archives 2025", niveau: 0 },
      { id: "5", nom: "Boîte de réception", niveau: 0 },
      { id: "6", nom: "Brouillons", niveau: 0 },
      { id: "7", nom: "Éléments envoyés", niveau: 0 },
    ]);
    expect(g.reception.map((d) => d.nom)).toEqual(["Comptabilité", "SK-CP"]);
    expect(g.autres.map((d) => d.nom)).toEqual(["Archives 2025", "Boîte de réception"]);
  });
});

describe("sujetDeReponse tagué copro (mail travaillé pour le tri)", () => {
  it("ajoute le code et le nom de la copro quand l'objet ne les cite pas", () => {
    expect(sujetDeReponse({ objet: "Fuite au 3e", coproCode: "S247", coproNom: "Le Cyrano" })).toBe("Re: S247 · Le Cyrano - Fuite au 3e");
    expect(sujetDeReponse({ objet: "RE: Fuite au 3e", coproCode: "S247", coproNom: "" })).toBe("Re: S247 - Fuite au 3e");
  });

  it("ne double pas un code déjà cité (S0247 ≡ S247) et ne touche rien sans copro", () => {
    expect(sujetDeReponse({ objet: "RE: [S0247] ODJ", coproCode: "S247", coproNom: "Le Cyrano" })).toBe("RE: [S0247] ODJ");
    expect(sujetDeReponse({ objet: "Fuite", coproCode: "", coproNom: "" })).toBe("Re: Fuite");
  });
});
