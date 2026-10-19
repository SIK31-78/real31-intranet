import { describe, expect, it } from "vitest";
import {
  AUCUN_BINOME,
  cleDeReference,
  clesDossiersDe,
  constaterRangement,
  coproDuDossier,
  coprosDansPdf,
  coprosImmeubleConcerne,
  estMailInterne,
  destinationDe,
  lignesBinomes,
  nettoyerCorps,
  suggestionSuivie,
  estAssistantDeCopro,
  referencesCitees,
  suggererCopro,
  fusionnerReferentiels,
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

const mail = (p: Partial<{ deAdresse: string; objet: string; apercu: string; corps: string }>) => ({
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

  it("reconnaît une copro par son numéro d'immatriculation RNC (indice sûr, cas ANAH)", () => {
    const ref: ReferentielTri = {
      copros: [{ reference: "S302", nom: "GABRIEL PERI", adresse: "", gestionnaire: null, assistant: null, immatriculation: "AA6459523" }],
      expediteurs: {},
    };
    const s = suggererCopro(mail({ deAdresse: "nepasrepondre.registre-coproprietes@anah.gouv.fr", apercu: "la copropriété 44/50 RUE GABRIEL PERI (numéro de copropriété : AA6459523 )" }), ref);
    expect(s).toMatchObject({ nature: "sure", candidats: ["S302"] });
    expect(s.raison).toContain("immatriculation");
  });

  it("reconnait une copro par le nom de l'immeuble cite (indice faible)", () => {
    const ref: ReferentielTri = {
      copros: [
        { reference: "S0247", nom: "LE CYRANO", adresse: "12 rue des Lilas 78400 Chatou", gestionnaire: null, assistant: null },
        { reference: "S0305", nom: "Les Jardins de Bezons", adresse: "3 rue du Parc 95870 Bezons", gestionnaire: null, assistant: null },
      ],
      expediteurs: {},
    };
    const s = suggererCopro(mail({ objet: "LE CYRANO - facture ascenseur" }), ref);
    expect(s).toMatchObject({ nature: "faible", candidats: ["S0247"] });
    expect(s.raison).toContain("Immeuble « LE CYRANO »");
    // « Bezons » seul (sa ville) ne doit PAS declencher la copro Les Jardins de Bezons.
    expect(suggererCopro(mail({ objet: "Intervention à Bezons" }), ref).nature).toBe("aucune");
  });

  it("reconnait une copro par sa voie citee quand le lieu (ville/CP) est present", () => {
    const ref: ReferentielTri = {
      copros: [{ reference: "S0300", nom: "RESIDENCE DU STADE", adresse: "71 rue de Bezons 95100 Argenteuil", gestionnaire: null, assistant: null }],
      expediteurs: {},
    };
    const s = suggererCopro(mail({ objet: "SOFRET - 71 RUE DE BEZONS 95100 ARGENTEUIL - devis" }), ref);
    expect(s).toMatchObject({ nature: "faible", candidats: ["S0300"] });
    expect(s.raison).toContain("bezons");
  });

  it("matche une adresse abrégée ou composée par les mots de la rue (E Vaillant ≈ Edouard Vaillant)", () => {
    const ref: ReferentielTri = {
      copros: [{ reference: "S0109", nom: "STMARTIN", adresse: "86 rue E Vaillant - 89-91 rue M Berteaux 95870 Bezons", gestionnaire: null, assistant: null }],
      expediteurs: {},
    };
    const s = suggererCopro(mail({ objet: "Minuterie HS - 86 rue Edouard Vaillant 95870 BEZONS" }), ref);
    expect(s).toMatchObject({ nature: "faible", candidats: ["S0109"] });
  });

  it("n'attache pas une voie citee sans son lieu (71 rue de Bezons à Carrières ≠ mail de Bezons)", () => {
    const ref: ReferentielTri = {
      copros: [{ reference: "S0300", nom: "BEZONS71CA", adresse: "71 rue de Bezons 78420 Carrières-sur-Seine", gestionnaire: null, assistant: null }],
      expediteurs: {},
    };
    // La voie apparaît mais la ville est 95870 Bezons, pas Carrières : pas de rattachement.
    expect(suggererCopro(mail({ objet: "DOUCE FOLIE - 71 rue de Bezons 95870 BEZONS" }), ref).nature).toBe("aucune");
  });

  it("ignore un nom d'immeuble qui n'apparaît que dans la signature (bas de corps)", () => {
    const ref: ReferentielTri = {
      copros: [{ reference: "S0158", nom: "LE MICHELET", adresse: "3 place Michelet 78800 Houilles", gestionnaire: null, assistant: null }],
      expediteurs: {},
    };
    const apercu = `${"Bonjour, merci de votre retour sur ce dossier. ".repeat(20)}\n-- \nREAL 31 - 3 place Michelet, LE MICHELET, Houilles`;
    expect(suggererCopro(mail({ objet: "Relance facture", apercu }), ref).nature).toBe("aucune");
  });

  it("laisse choisir quand deux copros sont citees par nom ou adresse", () => {
    const ref: ReferentielTri = {
      copros: [
        { reference: "S0247", nom: "LE CYRANO", adresse: "", gestionnaire: null, assistant: null },
        { reference: "S0305", nom: "URANUS", adresse: "", gestionnaire: null, assistant: null },
      ],
      expediteurs: {},
    };
    const s = suggererCopro(mail({ objet: "LE CYRANO et URANUS - tournée" }), ref);
    expect(s.nature).toBe("plusieurs");
    expect(s.candidats.sort()).toEqual(["S0247", "S0305"]);
  });

  it("le nom d'immeuble prime sur une copro qui ne partage que la rue", () => {
    const ref: ReferentielTri = {
      copros: [
        { reference: "S0204", nom: "LE PLAZZA", adresse: "152 avenue Gabriel Péri 95870 Bezons", gestionnaire: null, assistant: null },
        { reference: "S0198", nom: "DOUCE FOLIE", adresse: "150 avenue Gabriel Péri 95870 Bezons", gestionnaire: null, assistant: null },
      ],
      expediteurs: {},
    };
    const s = suggererCopro(mail({ objet: "LE PLAZZA - avenue Gabriel Péri 95870 Bezons - chauffage" }), ref);
    expect(s).toMatchObject({ nature: "faible", candidats: ["S0204"] });
  });

  it("un indice fort (code, adresse connue) prime sur le nom de l'immeuble", () => {
    const ref: ReferentielTri = {
      copros: [
        { reference: "SE999", nom: "LE CYRANO", adresse: "", gestionnaire: null, assistant: null },
        { reference: "S0297", nom: "AUTRE", adresse: "", gestionnaire: null, assistant: null },
      ],
      expediteurs: { "proprio@exemple.fr": [{ reference: "S0297", qualite: "copropriétaire" }] },
    };
    expect(suggererCopro(mail({ objet: "LE CYRANO", deAdresse: "proprio@exemple.fr" }), ref).candidats).toEqual(["S0297"]);
  });

  it("retire les liens Safelinks et les images [cid:] avant de lire le début du corps (audit du 19/10/2026)", () => {
    const ref: ReferentielTri = {
      copros: [{ reference: "S0247", nom: "LE CYRANO", adresse: "", gestionnaire: null, assistant: null }],
      expediteurs: {},
    };
    const safelink = `<https://eur01.safelinks.protection.outlook.com/?url=${"x".repeat(700)}>`;
    const apercu = `Pourquoi c'est important${safelink}\n[cid:image001.png@01DC0000.00000000]\nBonjour, fuite au CYRANO.`;
    expect(suggererCopro(mail({ apercu }), ref)).toMatchObject({ nature: "faible", candidats: ["S0247"] });
    expect(nettoyerCorps("voir <https://a.fr/x> et [cid:img.png] puis https://b.fr/y fin")).toBe("voir  et  puis  fin");
  });

  describe("« Immeuble concerné » cité dans l'échange (audit du 19/10/2026)", () => {
    const ref: ReferentielTri = {
      copros: [
        { reference: "S0109", nom: "LES TILLEULS", adresse: "86 rue E Vaillant - 89-91 rue M Berteaux 95870 BEZONS", gestionnaire: null, assistant: null },
        { reference: "S0176", nom: "LES ORMES", adresse: "66 rue du Colombier 78420 CARRIERES-SUR-SEINE", gestionnaire: null, assistant: null },
        { reference: "S0178", nom: "LES ROSIERS", adresse: "125 rue Louise Michel 78500 SARTROUVILLE", gestionnaire: null, assistant: null },
      ],
      expediteurs: { "voisin@exemple.fr": [{ reference: "S0178", qualite: "copropriétaire" }] },
    };
    const historique = (ligne: string) =>
      `Bonjour, c'est validé.\n${"Bla bla. ".repeat(200)}\n> Le 7 oct. 2026, Syndic a écrit :\n> Réf : AB/1234567\n> ${ligne}\n> Bonjour,`;

    it("le pied cité loin dans l'historique désigne la copro, avant l'expéditeur connu", () => {
      const corps = historique("Immeuble concerné : 86 rue E Vaillant - 89-91 rue M Berteaux-BEZONS\u200b");
      const s = suggererCopro(mail({ deAdresse: "voisin@exemple.fr", objet: "Re: devis", apercu: corps.slice(0, 400), corps }), ref);
      expect(s).toMatchObject({ nature: "sure", candidats: ["S0109"] });
      expect(s.raison).toContain("Immeuble concerné");
    });

    it("lit aussi « Immeuble : » en début de ligne et la ville collée par un tiret", () => {
      const corps = historique("Immeuble : 66 rue du Colombier-CARRIERES-SUR-SEINE");
      expect(coprosImmeubleConcerne(corps, ref.copros)).toEqual(["S0176"]);
      expect(coprosImmeubleConcerne("Je passerai dans l'immeuble : 66 rue du Colombier 78420", ref.copros)).toEqual([]);
    });

    it("contredit par le code de l'objet : à départager, le code d'abord", () => {
      const corps = historique("Immeuble concerné : 66 rue du Colombier-CARRIERES-SUR-SEINE");
      expect(suggererCopro(mail({ objet: "Re: S0178 · lierre", apercu: "", corps }), ref)).toMatchObject({
        nature: "plusieurs",
        candidats: ["S0178", "S0176"],
      });
      // D'accord avec l'objet : reste sûr.
      expect(suggererCopro(mail({ objet: "Re: S0176 · lierre", apercu: "", corps }), ref)).toMatchObject({ nature: "sure", candidats: ["S0176"] });
    });
  });

  describe("noms Crypto collés ou abrégés (audit du 19/10/2026)", () => {
    const c = (reference: string, nom: string): CoproTri => ({ reference, nom, adresse: "", gestionnaire: null, assistant: null });
    const ref: ReferentielTri = {
      copros: [c("S0109", "STMARTIN"), c("S0198", "LEPLAZZA"), c("S0291", "GALLIENI6"), c("S0288", "COEURJU"), c("S0176", "COLOMBIE66"), c("S0262", "LECLOS_E"), c("S0206", "PERI2")],
      expediteurs: {},
    };
    const candidats = (objet: string) => suggererCopro(mail({ objet }), ref).candidats;

    it("reconnaît un nom collé écrit en plusieurs mots, « saint » valant « st »", () => {
      expect(candidats("Re: St Martin - devis plot parking")).toEqual(["S0109"]);
      expect(candidats("Saint-Martin : devis")).toEqual(["S0109"]);
      expect(candidats("TR: Le Plazza - fuite")).toEqual(["S0198"]);
      expect(candidats("Re: Galliéni 6 - toitures")).toEqual(["S0291"]);
    });

    it("reconnaît un nom abrégé par Crypto", () => {
      expect(candidats("Coeur Julliand - encombrants")).toEqual(["S0288"]);
      expect(candidats("Re: Colombier 66 - lierre")).toEqual(["S0176"]);
    });

    it("pas de faux positif : mots non consécutifs, nom court, nom qui n'est pas une abréviation", () => {
      expect(candidats("Le gardien de la rue Plazza")).toEqual([]);
      expect(candidats("Le clos est fermé le samedi")).toEqual([]);
      expect(candidats("Gabriel Péri 2 étages")).toEqual([]);
      expect(candidats("Coeur de ville")).toEqual([]);
      expect(candidats("Colombier 12")).toEqual([]);
    });
  });

  describe("un fournisseur n'est jamais une piste sûre (audit du 19/10/2026)", () => {
    const ref: ReferentielTri = {
      copros: [
        { reference: "S0297", nom: "LE CYRANO", adresse: "", gestionnaire: null, assistant: null },
        { reference: "S0305", nom: "URANUS", adresse: "", gestionnaire: null, assistant: null },
      ],
      expediteurs: {
        "contact@ascensoriste.fr": [{ reference: "S0297", qualite: "fournisseur" }],
        "gerant@exemple.fr": [
          { reference: "S0305", qualite: "copropriétaire" },
          { reference: "S0297", qualite: "fournisseur" },
        ],
      },
    };

    it("connu d'une seule copro comme fournisseur : indice faible", () => {
      const s = suggererCopro(mail({ deAdresse: "contact@ascensoriste.fr", objet: "Facture" }), ref);
      expect(s).toMatchObject({ nature: "faible", candidats: ["S0297"] });
      expect(s.raison).toContain("Fournisseur");
    });

    it("le nom de l'immeuble cité passe avant le fournisseur", () => {
      expect(suggererCopro(mail({ deAdresse: "contact@ascensoriste.fr", objet: "URANUS - panne" }), ref)).toMatchObject({
        nature: "faible",
        candidats: ["S0305"],
      });
    });

    it("copropriétaire d'une copro et fournisseur d'une autre : à départager, la copro du copropriétaire d'abord", () => {
      expect(suggererCopro(mail({ deAdresse: "gerant@exemple.fr" }), ref)).toMatchObject({ nature: "plusieurs", candidats: ["S0305", "S0297"] });
    });
  });

  it("signale une copro citee qui n'est pas sur ESTALE", () => {
    const s = suggererCopro(mail({ objet: "Résiliation s0142" }), REF);
    expect(s).toMatchObject({ nature: "hors-estale", candidats: [] });
    expect(s.raison).toBe("Code S0142 cité, mais cette copropriété n'est pas dans le périmètre de la boîte.");
  });

  it("ne propose rien sans indice", () => {
    expect(suggererCopro(mail({}), REF)).toMatchObject({ nature: "aucune", candidats: [] });
  });
});

describe("estMailInterne", () => {
  it("vrai pour un collègue @real31.fr, faux pour la boîte partagée elle-même ou un externe", () => {
    expect(estMailInterne("Mylene.Pin@real31.fr", "syndic1@real31.fr")).toBe(true);
    expect(estMailInterne("syndic1@real31.fr", "syndic1@real31.fr")).toBe(false);
    expect(estMailInterne("client@gmail.com", "syndic1@real31.fr")).toBe(false);
  });
});

describe("coprosDansPdf", () => {
  const copros: CoproTri[] = [
    { reference: "S0177", nom: "DOUCE FOLIE", adresse: "25 avenue Gabriel Péri 95870 Bezons", gestionnaire: null, assistant: null },
    { reference: "S0158", nom: "LE MICHELET", adresse: "3 place Michelet 78800 Houilles", gestionnaire: null, assistant: null },
  ];

  it("trouve la copro du chantier et ignore l'en-tête du cabinet (REAL 31, place Michelet)", () => {
    const facture = [
      "REAL 31 - 3 place Michelet 78800 Houilles",
      "SIREN 123 456 789 - Carte professionnelle CPI 000",
      "Facture n° F-2026",
      "Lieu d'intervention : SDC DOUCE FOLIE, 25 avenue Gabriel Péri 95870 Bezons",
    ].join("\n");
    // L'en-tête (place Michelet -> S0158) est retirée ; seul le chantier (DOUCE FOLIE) ressort.
    expect(coprosDansPdf(facture, copros)).toEqual(["S0177"]);
  });

  it("rien quand le PDF ne cite qu'un code hors périmètre ou l'en-tête", () => {
    expect(coprosDansPdf("REAL 31 - 3 place Michelet 78800 Houilles\nSIREN 123", copros)).toEqual([]);
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

describe("fusionnerReferentiels (ESTALE + Crypto, 12/10/2026)", () => {
  const g = (email: string) => ({ nomComplet: email, email });
  const estale: ReferentielTri = {
    copros: [
      { reference: "S0300", nom: "Estale A", adresse: "1 rue A", gestionnaire: g("mp@real31.fr"), assistant: null },
      { reference: "S0297", nom: "Autre agence", adresse: "", gestionnaire: g("sc@real31.fr"), assistant: null },
    ],
    expediteurs: { "a@x.fr": [{ reference: "S0300", qualite: "copropriétaire" }] },
  };
  const crypto: ReferentielTri = {
    copros: [
      { reference: "S300", nom: "Crypto A", adresse: "", gestionnaire: g("autre@real31.fr"), assistant: g("as@real31.fr"), source: "crypto" },
      { reference: "S247", nom: "Crypto B", adresse: "2 rue B", gestionnaire: g("mp@real31.fr"), assistant: null, source: "crypto" },
    ],
    expediteurs: {
      "a@x.fr": [{ reference: "S300", qualite: "conseil syndical", source: "crypto" }],
      "b@y.fr": [{ reference: "S247", qualite: "copropriétaire", source: "crypto" }],
      "c@z.fr": [{ reference: "S999", qualite: "copropriétaire", source: "crypto" }],
    },
  };

  it("fusionne par code : ESTALE fait foi, Crypto complete l'assistant", () => {
    const r = fusionnerReferentiels(estale, crypto, null);
    const a = r.copros.find((c) => c.reference === "S0300")!;
    expect(a).toMatchObject({ nom: "Estale A", gestionnaire: g("mp@real31.fr"), assistant: g("as@real31.fr"), source: "estale" });
    expect(r.copros.find((c) => c.reference === "S247")?.source).toBe("crypto");
  });

  it("rattache les adresses Crypto a la reference ESTALE et ignore les copros inconnues", () => {
    const r = fusionnerReferentiels(estale, crypto, null);
    expect(r.expediteurs["a@x.fr"]).toEqual([
      { reference: "S0300", qualite: "copropriétaire", source: "estale" },
      { reference: "S0300", qualite: "conseil syndical", source: "crypto" },
    ]);
    expect(r.expediteurs["c@z.fr"]).toBeUndefined();
  });

  it("borne au perimetre de l'agence", () => {
    const r = fusionnerReferentiels(estale, crypto, new Set(["S300", "S247"]));
    expect(r.copros.map((c) => c.reference).sort()).toEqual(["S0300", "S247"]);
  });

  it("dit dans la suggestion d'ou vient l'adresse", () => {
    const r = fusionnerReferentiels(estale, crypto, null);
    const s = suggererCopro({ deAdresse: "b@y.fr", objet: "Fuite", apercu: "" }, r);
    expect(s).toMatchObject({ nature: "sure", candidats: ["S247"] });
    expect(s.raison).toContain("Crypto");
  });
});

describe("clesDossiersDe (mes mails sur la boîte partagée)", () => {
  const b = {
    binomes: [
      { id: "b1", gestionnaireEmail: "sophie@real31.fr", assistant: { nomComplet: "Clara", email: "Clara@real31.fr" }, principal: true },
      { id: "b2", gestionnaireEmail: "sophie@real31.fr", assistant: { nomComplet: "Nadia", email: "nadia@real31.fr" }, principal: false },
      { id: "b3", gestionnaireEmail: "marc@real31.fr", assistant: { nomComplet: "Clara", email: "clara@real31.fr" }, principal: true },
    ],
    parCopro: {},
  };

  it("un gestionnaire voit ses dossiers (principal et secondaires)", () => {
    expect([...clesDossiersDe("Sophie@real31.fr", b)].sort()).toEqual(["binome:b2", "binome:sophie@real31.fr"]);
  });

  it("une assistante voit les dossiers de ses binômes, chez plusieurs gestionnaires", () => {
    expect([...clesDossiersDe("clara@real31.fr", b)].sort()).toEqual(["binome:clara@real31.fr", "binome:marc@real31.fr", "binome:sophie@real31.fr"]);
  });
});
