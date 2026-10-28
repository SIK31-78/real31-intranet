import { describe, expect, it } from "vitest";
import {
  AUCUN_BINOME,
  motifCorbeille,
  avecMemeConversation,
  rangeableAutomatiquement,
  rangeableParPiecesJointes,
  aLirePiecesJointes,
  expediteursPublicite,
  suggestionCorbeille,
  cleDeReference,
  clesDossiersDe,
  clesDossiersLus,
  constaterRangement,
  coproDuDossier,
  coprosDansPdf,
  coprosImmeubleConcerne,
  estMailInterne,
  destinationDe,
  binomeDeCopro,
  lignesBinomes,
  nettoyerCorps,
  retirerEnteteCabinet,
  signalDuRangement,
  suggestionSuivie,
  estAssistantDeCopro,
  referencesCitees,
  suggererCopro,
  fusionnerReferentiels,
  type CoproTri,
  type ReferentielTri,
  pisteRangeable,
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

  it("ignore la signature du cabinet dans une réponse courte (audit du 19/10/2026)", () => {
    const ref: ReferentielTri = {
      copros: [{ reference: "S0158", nom: "MICHELET3", adresse: "3 place Michelet 78800 HOUILLES", gestionnaire: null, assistant: null }],
      expediteurs: {},
    };
    const apercu = "Madame,\nNous ne pouvons pas agir sur les parties privatives.\nCordialement\n\nGestionnaire de copropriétés\nREAL 31 - L'expérience fait la différence\n3 Place Michelet\n78800 HOUILLES";
    expect(suggererCopro(mail({ objet: "RE: Réclamation", apercu }), ref).nature).toBe("aucune");
  });

  describe("noms qui sont des adresses, villes, numéro de rue (audit du 19/10/2026)", () => {
    const c = (reference: string, nom: string, adresse: string): CoproTri => ({ reference, nom, adresse, gestionnaire: null, assistant: null });

    it("un nom ESTALE qui est une adresse ne vaut pas nom de résidence : l'adresse et son numéro décident", () => {
      const ref: ReferentielTri = {
        copros: [
          c("S0204", "152 AVENUE GABRIEL PERI BEZONS", "152 avenue Gabriel Péri 95870 Bezons"),
          c("S0177", "DOUCE FOLIE", "25 avenue Gabriel Péri 95870 Bezons"),
        ],
        expediteurs: {},
      };
      expect(suggererCopro(mail({ objet: "Fuite au 25 avenue Gabriel Péri 95870 Bezons" }), ref)).toMatchObject({ nature: "faible", candidats: ["S0177"] });
      expect(suggererCopro(mail({ objet: "Fuite au 152 avenue Gabriel Péri 95870 Bezons" }), ref).candidats).toEqual(["S0204"]);
    });

    it("un nom de ville n'est distinctif pour aucune copro du référentiel", () => {
      const ref: ReferentielTri = {
        copros: [c("S0301", "LES JARDINS DE CHATOU", "3 rue Gambetta 78800 Houilles"), c("S0119", "IMPRESSION", "137 rue des Landes 78400 Chatou")],
        expediteurs: {},
      };
      expect(suggererCopro(mail({ objet: "Intervention à Chatou demain" }), ref).nature).toBe("aucune");
    });

    it("le nom n'écrase plus l'adresse : les deux copros, le nom d'abord", () => {
      const ref: ReferentielTri = {
        copros: [c("S0247", "LE CYRANO", ""), c("S0200", "URANUS", "18 rue Danton 78800 Houilles")],
        expediteurs: {},
      };
      expect(suggererCopro(mail({ objet: "Cyrano - devis pour le 18 rue Danton 78800 Houilles" }), ref)).toMatchObject({
        nature: "plusieurs",
        candidats: ["S0247", "S0200"],
      });
    });

    it("le numéro de rue doit suivre, plages et « bis » compris", () => {
      const ref: ReferentielTri = {
        copros: [c("S0109", "TILLEULS", "86 rue E Vaillant - 89-91 rue M Berteaux 95870 Bezons"), c("S0243", "FAIDHERBE", "1 bis rue Faidherbe 78800 Houilles")],
        expediteurs: {},
      };
      expect(suggererCopro(mail({ objet: "Panne au 90 rue Maurice Berteaux 95870" }), ref).candidats).toEqual(["S0109"]);
      expect(suggererCopro(mail({ objet: "Panne au 12 rue Maurice Berteaux 95870" }), ref).nature).toBe("aucune");
      expect(suggererCopro(mail({ objet: "Interphone 1bis rue Faidherbe 78800" }), ref).candidats).toEqual(["S0243"]);
    });

    it("les abréviations de voie valent le mot entier, dans le mail comme en base", () => {
      const ref: ReferentielTri = {
        copros: [c("S0400", "LES ORMES", "12 boulevard des Platanes 92500 Exemple-Ville"), c("S0401", "LES CHENES", "7 av. des Peupliers 78800 Houilles")],
        expediteurs: {},
      };
      expect(suggererCopro(mail({ objet: "Parking du 12 bd des Platanes 92500" }), ref).candidats).toEqual(["S0400"]);
      expect(suggererCopro(mail({ objet: "Fuite au 7 avenue des Peupliers 78800" }), ref).candidats).toEqual(["S0401"]);
      expect(suggererCopro(mail({ objet: "Parking du 14 bd des Platanes 92500" }), ref).nature).toBe("aucune");
    });
  });

  describe("noms d'usage et adresses du registre national", () => {
    const c = (reference: string, nom: string, adresse: string, extra: Partial<CoproTri> = {}): CoproTri => ({
      reference,
      nom,
      adresse,
      gestionnaire: null,
      assistant: null,
      ...extra,
    });

    it("reconnaît le nom d'usage quand le nom Crypto est un code (« LE CLOS FLEURI » pour LECLOS_XYZ)", () => {
      const ref: ReferentielTri = {
        copros: [c("S0901", "LECLOS_XYZ", "10 rue des Lilas 78500 Sartrouville", { nomsUsage: ["LE CLOS FLEURI B-C et D"] })],
        expediteurs: {},
      };
      expect(suggererCopro(mail({ objet: "Résidence Le Clos Fleuri : fuite bâtiment C" }), ref)).toMatchObject({
        nature: "faible",
        candidats: ["S0901"],
      });
      expect(suggererCopro(mail({ objet: "Résidence Le Clos Fleuri" }), ref).raison).toContain("registre national");
    });

    it("un nom d'usage à un seul mot distinctif exige toute la suite : « Fleuri » seul ne suffit pas", () => {
      const ref: ReferentielTri = {
        copros: [c("S0901", "LECLOS_XYZ", "", { nomsUsage: ["LE CLOS FLEURI"] })],
        expediteurs: {},
      };
      expect(suggererCopro(mail({ objet: "Message de M. Fleuri" }), ref).nature).toBe("aucune");
      expect(suggererCopro(mail({ objet: "Le parc Fleuri" }), ref).nature).toBe("aucune");
    });

    it("ignore un nom d'usage générique, une adresse ou une saisie avec code postal", () => {
      const ref: ReferentielTri = {
        copros: [
          c("S0902", "ZZA", "", { nomsUsage: ["RESIDENCE LE PARC"] }),
          c("S0903", "ZZB", "", { nomsUsage: ["REFERENCIEL 92500 RUEIL MALMAISON"] }),
          c("S0904", "ZZC", "", { nomsUsage: ["12 RUE DES TILLEULS"] }),
        ],
        expediteurs: {},
      };
      expect(suggererCopro(mail({ objet: "Résidence le Parc, referenciel, rue des Tilleuls" }), ref).nature).toBe("aucune");
    });

    it("garde la règle à deux mots distinctifs : tous doivent être cités", () => {
      const ref: ReferentielTri = {
        copros: [c("S0905", "ZZD", "", { nomsUsage: ["LES HAUTS DE MONTFLEURY"] })],
        expediteurs: {},
      };
      expect(suggererCopro(mail({ objet: "AG des Hauts de Montfleury" }), ref).candidats).toEqual(["S0905"]);
      expect(suggererCopro(mail({ objet: "Rendez-vous à Montfleury" }), ref).nature).toBe("aucune");
    });

    it("reconnaît une adresse secondaire du registre, avec son lieu et son numéro", () => {
      const ref: ReferentielTri = {
        copros: [
          c("S0906", "ZZE2", "2-4 Avenue des Platanes 92500 Rueil-Malmaison", {
            adressesSecondaires: ["81 Boulevard Imaginaire 92500 Rueil-Malmaison"],
          }),
        ],
        expediteurs: {},
      };
      expect(suggererCopro(mail({ objet: "Sinistre au 81 boulevard Imaginaire, Rueil-Malmaison" }), ref)).toMatchObject({
        nature: "faible",
        candidats: ["S0906"],
      });
      expect(suggererCopro(mail({ objet: "Sinistre au 85 boulevard Imaginaire, Rueil-Malmaison" }), ref).nature).toBe("aucune");
      expect(suggererCopro(mail({ objet: "Sinistre au 81 boulevard Imaginaire" }), ref).nature).toBe("aucune");
    });

    it("la ville d'une adresse secondaire n'est distinctive pour aucun nom", () => {
      const ref: ReferentielTri = {
        copros: [
          c("S0907", "ZZF", "1 rue Haute 78500 Sartrouville", { adressesSecondaires: ["3 rue Basse 92999 Montvalon"] }),
          c("S0908", "MONTVALON", "5 rue Large 78500 Sartrouville"),
        ],
        expediteurs: {},
      };
      expect(suggererCopro(mail({ objet: "Travaux à Montvalon" }), ref).nature).toBe("aucune");
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

  it("devis sur deux colonnes : ne retire que le morceau du cabinet, l'adresse du chantier reste (audit du 19/10/2026)", () => {
    const devis = [
      "REAL 31 - 3 place Michelet 78800 Houilles        Adresse du chantier : 25 avenue Gabriel Péri 95870 Bezons",
      "RCS Versailles 123 456 789    Devis n° D-2026",
    ].join("\n");
    expect(coprosDansPdf(devis, copros)).toEqual(["S0177"]);
    expect(retirerEnteteCabinet("REAL 31 - 3 Place Michelet\n78800 HOUILLES\nBonjour")).not.toMatch(/michelet|houilles|real/i);
  });

  it("rien quand le PDF ne cite qu'un code hors périmètre ou l'en-tête", () => {
    expect(coprosDansPdf("REAL 31 - 3 place Michelet 78800 Houilles\nSIREN 123", copros)).toEqual([]);
  });

  it("l'adresse du cabinet abrégée « 3 PL MICHELET » est retirée aussi (bon de commande réel du 28/10/2026)", () => {
    const commande = "Adresse de facturation\nREAL 31\n. .\n3 PL MICHELET\n78800 HOUILLES\nFRANCE METROPOLITAINE\nAdresse de livraison";
    expect(coprosDansPdf(commande, copros)).toEqual([]);
    expect(retirerEnteteCabinet("Au 3 Pl. Michelet, 78800 Houilles")).not.toMatch(/michelet/i);
  });

  it("jamais d'adresse à une lettre près dans un PDF (cas réel du 28/10/2026, anonymisé : « fermer » lu « rue de la Ferme »)", () => {
    const ferme: CoproTri[] = [{ reference: "S0277", nom: "LES TILLEULS", adresse: "12 rue de la Ferme 78800 Houilles", gestionnaire: null, assistant: null }];
    const pdf = "Intervention au 12 rue Jean Jaurès 78800 Houilles.\nLe magasin va fermer de 12h30 à 14h.";
    expect(coprosDansPdf(pdf, ferme)).toEqual([]);
    // Une vraie faute de frappe non plus : dans un PDF, l'adresse doit être exacte.
    const faute = "Intervention au 12 rue de la Farme 78800 Houilles.";
    expect(coprosDansPdf(faute, ferme)).toEqual([]);
    // Dans le mail, la tolérance reste (à confirmer d'un clic).
    expect(suggererCopro(mail({ objet: "Intervention", apercu: faute }), { copros: ferme, expediteurs: {} }).candidats).toEqual(["S0277"]);
    // L'adresse exacte dans un PDF, elle, compte toujours.
    expect(coprosDansPdf("Intervention au 12 rue de la Ferme 78800 Houilles.", ferme)).toEqual(["S0277"]);
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

  describe("l'assistant de la fiche choisit le binome (27/10/2026, cas S077 de syndic2)", () => {
    const iniEL = { "emmanuel@real31.fr": "EL", "fanny@real31.fr": "FS", "galiano@real31.fr": "GG" };
    const FANNY = { nomComplet: "Fanny SORIVELLE", email: "fanny@real31.fr" };
    const GALIANO = { nomComplet: "Galiano GUAETTA", email: "Galiano@real31.fr" };
    const b = {
      binomes: [binome("fs", FANNY, true, "emmanuel@real31.fr"), binome("gg", GALIANO, false, "emmanuel@real31.fr")],
      parCopro: {},
    };
    const s077 = { ...copro("S077", "emmanuel@real31.fr"), assistant: { nomComplet: "Galiano", email: "galiano@real31.fr" } };

    it("assistant de la fiche = assistant d'un binome secondaire : ce binome, EL-GG, cle binome:<id>", () => {
      const d = destinationDe(s077, iniEL, b);
      expect(d?.nomDossier).toBe("EL-GG");
      expect(d?.cle).toBe("binome:gg");
      expect(binomeDeCopro(s077, b)?.id).toBe("gg");
    });

    it("assistant de la fiche inconnu des binomes : le principal", () => {
      const c = { ...s077, assistant: { nomComplet: "Autre", email: "autre@real31.fr" } };
      expect(destinationDe(c, iniEL, b)?.nomDossier).toBe("EL-FS");
      expect(destinationDe({ ...s077, assistant: null }, iniEL, b)?.cle).toBe("binome:emmanuel@real31.fr");
    });

    it("l'assistant d'un binome d'un AUTRE gestionnaire ne compte pas", () => {
      const autre = { binomes: [...b.binomes, binome("x", { nomComplet: "Léa", email: "lea@real31.fr" }, false, "sandy@real31.fr")], parCopro: {} };
      const c = { ...s077, assistant: { nomComplet: "Léa", email: "lea@real31.fr" } };
      expect(destinationDe(c, iniEL, autre)?.nomDossier).toBe("EL-FS");
    });

    it("l'affectation a la main passe avant la fiche", () => {
      expect(destinationDe(s077, iniEL, { ...b, parCopro: { S077: "fs" } })?.nomDossier).toBe("EL-FS");
    });

    it("Galiano voit le dossier EL-GG, Fanny ne le voit pas ; la copro se deduit du dossier", () => {
      expect(clesDossiersDe("galiano@real31.fr", b).has("binome:gg")).toBe(true);
      expect(clesDossiersDe("fanny@real31.fr", b).has("binome:gg")).toBe(false);
      expect(clesDossiersDe("emmanuel@real31.fr", b).has("binome:gg")).toBe(true);
      const autreCopro = copro("S078", "emmanuel@real31.fr");
      expect(coproDuDossier("binome:gg", [s077, autreCopro], iniEL, b)).toBe("S077");
      expect(coproDuDossier("binome:emmanuel@real31.fr", [s077, autreCopro], iniEL, b)).toBe("S078");
    });

    it("l'ecran des binomes montre EL-GG pour S077 sans affectation a la main", () => {
      const [l] = lignesBinomes([], [s077], b, iniEL);
      expect(l?.copros).toEqual([{ reference: "S077", nom: "Copro S077", binomeId: "gg" }]);
    });
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

describe("signalDuRangement (journal honnête, audit du 19/10/2026)", () => {
  it("copro proposée par la lecture des PDF quand le mail n'avait aucune piste : signal « pj »", () => {
    expect(signalDuRangement({ nature: "aucune", candidats: [] }, { candidats: ["S0177"] })).toEqual({ nature: "pj", candidats: ["S0177"] });
    expect(signalDuRangement({ nature: "hors-estale", candidats: [] }, { candidats: ["S0177"] }).nature).toBe("pj");
  });

  it("garde la suggestion du mail quand elle avait des candidates, ou que les PDF n'ont rien donné", () => {
    expect(signalDuRangement({ nature: "faible", candidats: ["S0297"] }, { candidats: ["S0177"] })).toEqual({ nature: "faible", candidats: ["S0297"] });
    expect(signalDuRangement({ nature: "aucune", candidats: [] }, null)).toEqual({ nature: "aucune", candidats: [] });
    expect(signalDuRangement({ nature: "aucune", candidats: [] }, { candidats: [] }).nature).toBe("aucune");
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

describe("fusionnerReferentiels et registre national", () => {
  it("une copro ESTALE reprend les noms d'usage et adresses du registre venus de Crypto", () => {
    const crypto: ReferentielTri = {
      copros: [{ ...copro("S297"), nomsUsage: ["LE CLOS FLEURI"], adressesSecondaires: ["1 rue Haute 78500 Sartrouville"] }],
      expediteurs: {},
    };
    const fusion = fusionnerReferentiels({ copros: [copro("S0297")], expediteurs: {} }, crypto, null);
    expect(fusion.copros[0]).toMatchObject({ reference: "S0297", nomsUsage: ["LE CLOS FLEURI"], adressesSecondaires: ["1 rue Haute 78500 Sartrouville"] });
  });
});

describe("avecMemeConversation (historique du tri, même conversation seulement)", () => {
  const rien = { nature: "aucune" as const, candidats: [], raison: "Rien." };

  it("sans autre piste : la copro du fil en piste faible, jamais sûre", () => {
    const s = avecMemeConversation(rien, "S297", REF);
    expect(s).toMatchObject({ nature: "faible", candidats: ["S0297"], origine: "conversation" });
    expect(s.raison).toContain("même conversation");
    expect(signalDuRangement(s, null)).toEqual({ nature: "conversation", candidats: ["S0297"] });
  });

  it("une piste sûre reste telle quelle", () => {
    const sure = { nature: "sure" as const, candidats: ["S0305"], raison: "Code S0305 cité dans l'objet." };
    expect(avecMemeConversation(sure, "S0297", REF)).toBe(sure);
  });

  it("une piste faible différente : la copro du fil s'ajoute en dernière candidate", () => {
    const faible = { nature: "faible" as const, candidats: ["S0305"], raison: "Code S0305 cité dans le message." };
    expect(avecMemeConversation(faible, "S0297", REF)).toMatchObject({ nature: "plusieurs", candidats: ["S0305", "S0297"] });
    expect(avecMemeConversation(faible, "S0305", REF)).toMatchObject({ nature: "faible", candidats: ["S0305"] });
  });

  it("ignore une copro sortie du périmètre et l'absence d'historique", () => {
    expect(avecMemeConversation(rien, "S0999", REF)).toBe(rien);
    expect(avecMemeConversation(rien, null, REF)).toBe(rien);
  });
});

describe("copros inactives : reconnues, au plus une piste faible", () => {
  const inactive = (reference: string): CoproTri => ({ ...copro(reference), inactive: true });
  const ref: ReferentielTri = {
    copros: [copro("S0297"), inactive("S0182"), { ...inactive("S0183"), immatriculation: "ZZ1234567" }],
    expediteurs: {
      "ancien@exemple.fr": [{ reference: "S0182", qualite: "copropriétaire" }],
      "deux@exemple.fr": [
        { reference: "S0182", qualite: "copropriétaire" },
        { reference: "S0297", qualite: "copropriétaire" },
      ],
    },
  };

  it("un code dans l'objet d'une copro inactive donne une piste faible, pas sûre", () => {
    const s = suggererCopro(mail({ objet: "RE: S0182 travaux" }), ref);
    expect(s).toMatchObject({ nature: "faible", candidats: ["S0182"] });
    expect(s.raison).toContain("inactive");
  });

  it("l'immatriculation ou l'expéditeur d'une copro inactive : faible aussi", () => {
    expect(suggererCopro(mail({ objet: "Registre ZZ1234567" }), ref)).toMatchObject({ nature: "faible", candidats: ["S0183"] });
    expect(suggererCopro(mail({ deAdresse: "ancien@exemple.fr" }), ref)).toMatchObject({ nature: "faible", candidats: ["S0182"] });
  });

  it("un expéditeur connu d'une active et d'une inactive : l'active seule, en piste sûre", () => {
    expect(suggererCopro(mail({ deAdresse: "deux@exemple.fr" }), ref)).toMatchObject({ nature: "sure", candidats: ["S0297"] });
  });

  it("plusieurs candidates : les actives d'abord", () => {
    expect(suggererCopro(mail({ objet: "S0182 et S0297" }), ref)).toMatchObject({ nature: "plusieurs", candidats: ["S0297", "S0182"] });
  });

  it("une copro inactive ne rend pas un dossier ambigu", () => {
    expect(coproDuDossier("binome:g@real31.fr", [copro("S0297"), inactive("S0182")], { "g@real31.fr": "GG" }, AUCUN_BINOME)).toBe("S0297");
  });
});

describe("motifCorbeille (non remis, réponses automatiques)", () => {
  const m = (objet: string, deAdresse = "quelquun@exemple.fr") => ({ objet, deAdresse });

  it("reconnaît les avis de non-remise, par l'objet ou l'expéditeur", () => {
    expect(motifCorbeille(m("Non remis : Convocation AG"))).toBe("non-remis");
    expect(motifCorbeille(m("Undeliverable: Appel de fonds"))).toBe("non-remis");
    expect(motifCorbeille(m("Delivery Status Notification (Failure)"))).toBe("non-remis");
    expect(motifCorbeille(m("Échec de la remise du message"))).toBe("non-remis");
    expect(motifCorbeille(m("Votre message", "MAILER-DAEMON@exemple.fr"))).toBe("non-remis");
    expect(motifCorbeille(m("Votre message", "postmaster@exemple.fr"))).toBe("non-remis");
    expect(motifCorbeille(m("Message", "MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@exemple.fr"))).toBe("non-remis");
  });

  it("reconnaît les réponses automatiques", () => {
    expect(motifCorbeille(m("Réponse automatique : Fuite parking"))).toBe("reponse-auto");
    expect(motifCorbeille(m("Automatic reply: Devis"))).toBe("reponse-auto");
    expect(motifCorbeille(m("Absence du bureau"))).toBe("reponse-auto");
    expect(motifCorbeille(m("[EXTERNE] Out of Office: Facture"))).toBe("reponse-auto");
  });

  it("ne touche ni une vraie réponse ni un objet qui en parle", () => {
    expect(motifCorbeille(m("RE: Non remis : Convocation AG"))).toBeNull();
    expect(motifCorbeille(m("Courrier non remis au gardien, que faire ?"))).toBeNull();
    expect(motifCorbeille(m("Fuite au 3e étage"))).toBeNull();
  });
});

describe("rangeableAutomatiquement (tri automatique, piste sûre)", () => {
  const sure = (reference = "S0297") => ({ nature: "sure" as const, candidats: [reference], raison: `Code ${reference} cité dans l'objet.` });
  const ctx = (o: Partial<Parameters<typeof rangeableAutomatiquement>[1]> = {}) => ({
    automatique: true,
    dejaPasse: false,
    copros: [copro("S0297"), { ...copro("S0305"), inactive: true }, { ...copro("S0400"), gestionnaire: null }, copro("S0500", "sans.initiales@real31.fr")],
    initialesParEmail: { "g@real31.fr": "GG" },
    ...o,
  });

  it("range une piste sûre sur une copro active dont le dossier est connu", () => {
    expect(rangeableAutomatiquement({ suggestion: sure() }, ctx())).toEqual({ ok: true, reference: "S0297" });
  });

  it("refuse quand l'automatique est coupé pour la boîte (config de la boîte ou MAIL_TRI_AUTO)", () => {
    expect(rangeableAutomatiquement({ suggestion: sure() }, ctx({ automatique: false }))).toEqual({ ok: false, motif: "automatique-coupe" });
  });

  it("refuse quand la corbeille est proposée ou que le mail est interne", () => {
    expect(rangeableAutomatiquement({ corbeille: "non-remis", suggestion: suggestionCorbeille("non-remis") }, ctx())).toEqual({ ok: false, motif: "corbeille" });
    // Même avec une piste sûre par ailleurs : la corbeille prime.
    expect(rangeableAutomatiquement({ corbeille: "reponse-auto", suggestion: sure() }, ctx())).toEqual({ ok: false, motif: "corbeille" });
    expect(rangeableAutomatiquement({ interne: true, suggestion: sure() }, ctx())).toEqual({ ok: false, motif: "interne" });
  });

  it("refuse tout ce qui n'est pas une piste sûre sur une seule copro", () => {
    for (const s of [
      { nature: "plusieurs" as const, candidats: ["S0297", "S0305"], raison: "" },
      { nature: "faible" as const, candidats: ["S0297"], raison: "" },
      { nature: "aucune" as const, candidats: [], raison: "" },
      { nature: "hors-estale" as const, candidats: [], raison: "" },
      { nature: "sure" as const, candidats: ["S0297", "S0305"], raison: "" },
      { nature: "sure" as const, candidats: ["S0297"], raison: "", origine: "conversation" as const },
    ]) {
      expect(rangeableAutomatiquement({ suggestion: s }, ctx())).toEqual({ ok: false, motif: "pas-sure" });
    }
  });

  it("refuse un mail déjà passé par le tri (rangé, ou rangé puis remis dans la file)", () => {
    expect(rangeableAutomatiquement({ suggestion: sure() }, ctx({ dejaPasse: true }))).toEqual({ ok: false, motif: "deja-passe" });
  });

  it("refuse une copro inactive, inconnue ou sans dossier de binôme", () => {
    expect(rangeableAutomatiquement({ suggestion: sure("S0305") }, ctx())).toEqual({ ok: false, motif: "copro-inactive" });
    expect(rangeableAutomatiquement({ suggestion: sure("S0999") }, ctx())).toEqual({ ok: false, motif: "copro-inconnue" });
    expect(rangeableAutomatiquement({ suggestion: sure("S0400") }, ctx())).toEqual({ ok: false, motif: "sans-destination" });
    expect(rangeableAutomatiquement({ suggestion: sure("S0500") }, ctx())).toEqual({ ok: false, motif: "sans-destination" });
  });

  it("une copro inactive citée dans l'objet n'arrive jamais en piste sûre", () => {
    const ref: ReferentielTri = { copros: [{ ...copro("S0305"), inactive: true }], expediteurs: {} };
    const s = suggererCopro(mail({ objet: "S0305 - fuite" }), ref);
    expect(s.nature).toBe("faible");
    expect(rangeableAutomatiquement({ suggestion: s }, ctx({ copros: ref.copros }))).toEqual({ ok: false, motif: "pas-sure" });
  });
});

describe("piste faible par le nom ou l'adresse : rangeable sans clic (26/10/2026)", () => {
  // Donnees inventees.
  const actives: CoproTri[] = [
    { ...copro("S0247"), nom: "LE CYRANO", adresse: "12 rue des Lilas 78400 Chatou" },
    // Un autre gestionnaire : deux copros de dossiers differents restent a choisir.
    { ...copro("S0305", "h@real31.fr"), nom: "LES PRIMEVERES", adresse: "8 rue des Peupliers 78800 Houilles", nomsUsage: ["Résidence les Glycines"] },
    { ...copro("S0410"), nom: "LES CEDRES", adresse: "", inactive: true },
  ];
  const ref: ReferentielTri = {
    copros: actives,
    expediteurs: { "ascenseurs@exemple.fr": [{ reference: "S0247", qualite: "fournisseur" }] },
  };
  const ctx = { automatique: true, dejaPasse: false, copros: actives, initialesParEmail: { "g@real31.fr": "GG", "h@real31.fr": "HH" } };
  const decider = (m: Parameters<typeof mail>[0]) => rangeableAutomatiquement({ suggestion: suggererCopro(mail(m), ref) }, ctx);

  it("le nom de l'immeuble seul, sur une copro : faible d'origine « nom-adresse », rangé", () => {
    const s = suggererCopro(mail({ objet: "Intervention résidence LE CYRANO" }), ref);
    expect(s).toMatchObject({ nature: "faible", candidats: ["S0247"], origine: "nom-adresse" });
    expect(rangeableAutomatiquement({ suggestion: s }, ctx)).toEqual({ ok: true, reference: "S0247" });
    // Le journal garde « faible », pas « sure ».
    expect(signalDuRangement(s, null)).toEqual({ nature: "faible", candidats: ["S0247"] });
  });

  it("l'adresse ou un nom d'usage du registre : rangé aussi", () => {
    expect(decider({ objet: "Compte rendu", apercu: "Passage au 12 rue des Lilas 78400 Chatou ce matin." })).toEqual({ ok: true, reference: "S0247" });
    expect(decider({ objet: "Résidence les Glycines : badge" })).toEqual({ ok: true, reference: "S0305" });
  });

  it("refuse le fournisseur seul, le code dans le corps, l'historique de la conversation", () => {
    expect(decider({ deAdresse: "ascenseurs@exemple.fr", objet: "Visite d'entretien" })).toEqual({ ok: false, motif: "pas-sure" });
    expect(decider({ objet: "Bonjour", apercu: "Voir le dossier S0247." })).toEqual({ ok: false, motif: "pas-sure" });
    const fil = avecMemeConversation(suggererCopro(mail({ objet: "Bonjour" }), ref), "S0247", ref);
    expect(rangeableAutomatiquement({ suggestion: fil }, ctx)).toEqual({ ok: false, motif: "pas-sure" });
  });

  it("refuse quand un code hors périmètre est cité à côté du nom", () => {
    const s = suggererCopro(mail({ objet: "S0142 et LE CYRANO" }), ref);
    expect(s).toMatchObject({ nature: "faible", candidats: ["S0247"] });
    expect(s.origine).toBeUndefined();
    expect(rangeableAutomatiquement({ suggestion: s }, ctx)).toEqual({ ok: false, motif: "pas-sure" });
  });

  it("refuse deux copros citées, une copro inactive, et la conversation qui contredit", () => {
    expect(decider({ objet: "LE CYRANO et Résidence les Glycines" })).toEqual({ ok: false, motif: "pas-sure" });
    expect(decider({ objet: "Résidence LES CEDRES : fuite" })).toEqual({ ok: false, motif: "copro-inactive" });
    const contredite = avecMemeConversation(suggererCopro(mail({ objet: "LE CYRANO" }), ref), "S0305", ref);
    expect(contredite.nature).toBe("plusieurs");
    expect(rangeableAutomatiquement({ suggestion: contredite }, ctx)).toEqual({ ok: false, motif: "pas-sure" });
  });
});

describe("rangeableParPiecesJointes (PDF lus par la tâche planifiée, 26/10/2026)", () => {
  const ctx = {
    automatique: true,
    dejaPasse: false,
    copros: [copro("S0297"), copro("S0305", "h@real31.fr"), { ...copro("S0410"), inactive: true }, copro("S0298")],
    initialesParEmail: { "g@real31.fr": "GG", "h@real31.fr": "HH" },
  };
  const rien = { nature: "aucune" as const, candidats: [], raison: "" };

  it("une seule copro dans les PDF : rangé", () => {
    expect(rangeableParPiecesJointes({ suggestion: rien }, ["S0305"], ctx)).toEqual({ ok: true, reference: "S0305" });
    // Le PDF départage une piste « plusieurs ».
    const plusieurs = { nature: "plusieurs" as const, candidats: ["S0297", "S0305"], raison: "" };
    expect(rangeableParPiecesJointes({ suggestion: plusieurs }, ["S0297"], ctx)).toEqual({ ok: true, reference: "S0297" });
  });

  it("aucune, plusieurs, contradiction, copro inactive : pas d'automatique", () => {
    expect(rangeableParPiecesJointes({ suggestion: rien }, [], ctx)).toEqual({ ok: false, motif: "pj-aucune" });
    expect(rangeableParPiecesJointes({ suggestion: rien }, ["S0297", "S0305"], ctx)).toEqual({ ok: false, motif: "pj-plusieurs" });
    const fournisseur = { nature: "faible" as const, candidats: ["S0297"], raison: "" };
    expect(rangeableParPiecesJointes({ suggestion: fournisseur }, ["S0305"], ctx)).toEqual({ ok: false, motif: "pj-conflit" });
    expect(rangeableParPiecesJointes({ suggestion: rien }, ["S0410"], ctx)).toEqual({ ok: false, motif: "copro-inactive" });
  });

  it("mêmes garde-fous que la piste sûre", () => {
    expect(rangeableParPiecesJointes({ suggestion: rien }, ["S0305"], { ...ctx, automatique: false })).toEqual({ ok: false, motif: "automatique-coupe" });
    expect(rangeableParPiecesJointes({ corbeille: "non-remis", suggestion: rien }, ["S0305"], ctx)).toEqual({ ok: false, motif: "corbeille" });
    expect(rangeableParPiecesJointes({ interne: true, suggestion: rien }, ["S0305"], ctx)).toEqual({ ok: false, motif: "interne" });
    expect(rangeableParPiecesJointes({ suggestion: rien }, ["S0305"], { ...ctx, dejaPasse: true })).toEqual({ ok: false, motif: "deja-passe" });
    const hors = { nature: "hors-estale" as const, candidats: [], raison: "" };
    expect(rangeableParPiecesJointes({ suggestion: hors }, ["S0305"], ctx)).toEqual({ ok: false, motif: "pas-sure" });
  });

  it("on ne lit les PDF que d'un mail sans piste rangeable, jamais passé, avec pièces jointes", () => {
    const pasSure = { ok: false as const, motif: "pas-sure" as const };
    expect(aLirePiecesJointes({ aPiecesJointes: true, suggestion: rien }, pasSure, false)).toBe(true);
    expect(aLirePiecesJointes({ aPiecesJointes: false, suggestion: rien }, pasSure, false)).toBe(false);
    expect(aLirePiecesJointes({ aPiecesJointes: true, suggestion: rien }, pasSure, true)).toBe(false);
    expect(aLirePiecesJointes({ aPiecesJointes: true, suggestion: rien }, { ok: false, motif: "corbeille" }, false)).toBe(false);
    expect(aLirePiecesJointes({ aPiecesJointes: true, suggestion: rien }, { ok: true, reference: "S0297" }, false)).toBe(false);
  });
});

describe("expediteursPublicite (corbeille proposée, apprise du journal, 26/10/2026)", () => {
  // Donnees inventees.
  const ligne = (expediteur: string, o: Partial<{ objet: string; dossierCle: string | null; coproReference: string | null; copros: string[] }> = {}) => ({
    expediteur,
    objet: "Offre spéciale",
    dossierCle: "corbeille" as string | null,
    coproReference: null as string | null,
    copros: [] as string[],
    ...o,
  });

  it("deux corbeilles, jamais rangé : publicité (adresse sans la casse)", () => {
    const pubs = expediteursPublicite([ligne("Newsletter@Pub.fr"), ligne("newsletter@pub.fr")]);
    expect([...pubs]).toEqual(["newsletter@pub.fr"]);
    expect(motifCorbeille({ deAdresse: "NEWSLETTER@pub.fr", objet: "Nouvelle offre" }, pubs)).toBe("publicite");
    expect(suggestionCorbeille("publicite").raison).toContain("au moins deux fois");
  });

  it("une seule corbeille, ou un seul rangement dans une copro ou un dossier de binôme : non", () => {
    expect(expediteursPublicite([ligne("a@pub.fr")]).size).toBe(0);
    expect(expediteursPublicite([ligne("a@pub.fr"), ligne("a@pub.fr"), ligne("a@pub.fr", { dossierCle: "binome:g@real31.fr" })]).size).toBe(0);
    expect(expediteursPublicite([ligne("a@pub.fr"), ligne("a@pub.fr"), ligne("a@pub.fr", { dossierCle: "comptabilite", coproReference: "S0297", copros: ["S0297"] })]).size).toBe(0);
    // Divers ou Comptabilité sans copro ne compte pas comme un rangement.
    expect(expediteursPublicite([ligne("a@pub.fr"), ligne("a@pub.fr"), ligne("a@pub.fr", { dossierCle: "divers" })]).size).toBe(1);
  });

  it("par adresse, pas par domaine", () => {
    expect(expediteursPublicite([ligne("a@pub.fr"), ligne("b@pub.fr")]).size).toBe(0);
  });

  it("ni le cabinet, ni une adresse connue d'une copro, ni des non-remis ou réponses automatiques", () => {
    expect(expediteursPublicite([ligne("collegue@real31.fr"), ligne("collegue@real31.fr")]).size).toBe(0);
    expect(expediteursPublicite([ligne("proprio@exemple.fr"), ligne("proprio@exemple.fr")], { "proprio@exemple.fr": [] }).size).toBe(0);
    const absences = [ligne("x@exemple.fr", { objet: "Réponse automatique : AG" }), ligne("x@exemple.fr", { objet: "Non remis : PV" })];
    expect(expediteursPublicite(absences).size).toBe(0);
  });

  it("la publicité bloque l'automatique comme les autres corbeilles", () => {
    const sure = { nature: "sure" as const, candidats: ["S0297"], raison: "" };
    const ctx = { automatique: true, dejaPasse: false, copros: [copro("S0297")], initialesParEmail: { "g@real31.fr": "GG" } };
    expect(rangeableAutomatiquement({ corbeille: "publicite", suggestion: sure }, ctx)).toEqual({ ok: false, motif: "corbeille" });
  });
});

describe("adresse à une lettre près (faute de frappe dans le nom de rue, 26/10/2026)", () => {
  // Donnees inventees, sauf l'adresse de S210 (cas reel du 26/10).
  const c = (reference: string, adresse: string, nom = `Copro ${reference}`): CoproTri => ({ reference, nom, adresse, gestionnaire: null, assistant: null });
  const ref: ReferentielTri = {
    copros: [c("S0210", "6 rue Marcel Sembat 78800 HOUILLES"), c("S0301", "12 rue Pasteur 78800 Houilles"), c("S0302", "12 rue Pastour 78800 Houilles")],
    expediteurs: {},
  };
  const trouve = (texte: string) => suggererCopro(mail({ objet: "Intervention", apercu: texte }), ref);

  it("« 6 rue Marcel SAMBAT 78800 » trouve S210", () => {
    const s = trouve("Intervention au 6 rue Marcel SAMBAT 78800 ce jour.");
    expect(s).toMatchObject({ nature: "faible", candidats: ["S0210"] });
    expect(s.raison).toContain("une lettre d'écart");
    // À confirmer d'un clic : pas rangée seule (27/10/2026).
    expect(s.origine).toBeUndefined();
    expect(pisteRangeable(s)).toBe(false);
  });

  it("un numéro différent, ou un code postal différent, ne trouve pas", () => {
    expect(trouve("Intervention au 8 rue Marcel SAMBAT 78800 ce jour.").candidats).toEqual([]);
    expect(trouve("Intervention au 6 rue Marcel SAMBAT 92000 ce jour.").candidats).toEqual([]);
  });

  it("deux rues proches d'une même ville ne se confondent pas", () => {
    expect(trouve("Passage au 12 rue Pasteur 78800 Houilles.")).toMatchObject({ nature: "faible", candidats: ["S0301"] });
    expect(trouve("Passage au 12 rue Pastour 78800 Houilles.")).toMatchObject({ nature: "faible", candidats: ["S0302"] });
    // Une troisième orthographe, à une lettre des deux : on ne choisit pas.
    expect(trouve("Passage au 12 rue Pastaur 78800 Houilles.").nature).toBe("plusieurs");
  });

  it("pas de tolérance sur un nom d'immeuble ni sur un mot court", () => {
    const r: ReferentielTri = { copros: [c("S0400", "", "LE BELVEDERE"), c("S0401", "3 rue Lyon 78800 Houilles")], expediteurs: {} };
    expect(suggererCopro(mail({ objet: "Résidence LE BELVEDARE" }), r).candidats).toEqual([]);
    expect(suggererCopro(mail({ objet: "Au 3 rue Lion 78800" }), r).candidats).toEqual([]);
  });
});

describe("clesDossiersLus : un comptable lit « Comptabilité », jamais les binômes (28/10/2026)", () => {
  const b = {
    binomes: [{ id: "x", gestionnaireEmail: "sandy@real31.fr", assistant: { nomComplet: "Elsa", email: "elsa@real31.fr" }, principal: true }],
    parCopro: {},
  };
  it("un comptable : le seul dossier comptabilite, même s'il figure dans un binôme", () => {
    expect([...clesDossiersLus({ email: "elsa@real31.fr", comptable: true }, b)]).toEqual(["comptabilite"]);
  });
  it("les autres : leurs dossiers de binôme, comme avant", () => {
    expect(clesDossiersLus({ email: "elsa@real31.fr", comptable: false }, b)).toEqual(clesDossiersDe("elsa@real31.fr", b));
    expect(clesDossiersLus({ email: "sophie@real31.fr", comptable: false }, AUCUN_BINOME).has("comptabilite")).toBe(false);
  });
});

describe("le numéro de la copro doit précéder le type de voie (28/10/2026)", () => {
  // Cas réels de syndic2 et syndic4, noms et numéros changés.
  const c = (reference: string, adresse: string, nom = `Copro ${reference}`): CoproTri => ({ reference, nom, adresse, gestionnaire: null, assistant: null });
  const ref: ReferentielTri = {
    copros: [c("S0217", "6 - 8 - 10 rue Jean Valmont 92250 LA GARENNE-COLOMBES"), c("S0261", "25-33 rue des Tilleuls/2 rue des Pivoines 78500 SARTROUVILLE")],
    expediteurs: {},
  };
  const trouve = (texte: string) => suggererCopro(mail({ objet: "Votre contrat d'eau", apercu: texte }), ref);

  it("une rue citée sans numéro, et un « 10 » dans une date, ne désignent plus la copro", () => {
    expect(trouve("Adresse desservie :\nRUE JEAN VALMONT\n92250 LA GARENNE COLOMBES\nNous vous informons que depuis le 25/10/2026, votre consommation…").candidats).toEqual([]);
  });

  it("« UTC+2 », « CEDEX 9 » ou « le 28 octobre » ne sont pas des numéros de rue", () => {
    expect(trouve("Le jeudi 22 octobre 2026 à 15:59 UTC+2, le cabinet a écrit :\nImmeuble concerné : Rue des Pivoines-SARTROUVILLE").candidats).toEqual([]);
    expect(trouve("Rue des Pivoines 78500 Sartrouville CEDEX 2, rendez-vous le 28 octobre").candidats).toEqual([]);
  });

  it("le numéro juste devant la rue la désigne, même avec « bis », « et », un intervalle", () => {
    expect(trouve("Fuite au 8 rue Jean Valmont 92250 La Garenne-Colombes").candidats).toEqual(["S0217"]);
    expect(trouve("Fuite au 6 et 8 rue Jean Valmont 92250 La Garenne-Colombes").candidats).toEqual(["S0217"]);
    expect(trouve("Fuite au 10 bis, rue Jean Valmont 92250 La Garenne-Colombes").candidats).toEqual(["S0217"]);
    expect(trouve("Passage au 2 rue des Pivoines 78500 Sartrouville").candidats).toEqual(["S0261"]);
  });

  it("vaut aussi pour l'adresse à une lettre près", () => {
    expect(trouve("Fuite au 8 rue Jean VALMONS 92250 La Garenne-Colombes").candidats).toEqual(["S0217"]);
    expect(trouve("Rue Jean VALMONS 92250 La Garenne-Colombes, le 8 novembre").candidats).toEqual([]);
  });
});

describe("mot de rue partagé et suffixe du registre dans les noms (28/10/2026)", () => {
  // Cas réels de syndic2 (contrats d'eau) et syndic4 (S291), noms de rue changés.
  const c = (reference: string, nom: string, adresse: string, nomsUsage?: string[]): CoproTri => ({
    reference, nom, adresse, gestionnaire: null, assistant: null, ...(nomsUsage ? { nomsUsage } : {}),
  });
  const ref: ReferentielTri = {
    copros: [
      c("S0094", "JLAMART64", "64 rue Jean Lamartine 92250 La Garenne-Colombes", ["SDC 64 JEAN LAMARTINE"]),
      c("S0217", "JLAMART8", "6 - 8 - 10 rue Jean Lamartine 92250 La Garenne-Colombes"),
      c("S0280", "VERDIER43", "43 rue Verdier 92250 La Garenne-Colombes", ["LES ACACIAS - MS179799"]),
    ],
    expediteurs: {},
  };

  it("un mot de rue porté par deux copros ne reconnaît plus une copro par son nom", () => {
    const s = suggererCopro(mail({ objet: "Votre contrat d'eau", apercu: "Adresse desservie :\n8 RUE JEAN LAMARTINE\n92250 LA GARENNE COLOMBES" }), ref);
    // Avant : S0094 aussi, par son nom au registre « SDC 64 JEAN LAMARTINE ».
    expect(s).toMatchObject({ nature: "faible", candidats: ["S0217"], origine: "nom-adresse" });
  });

  it("le suffixe « - MS123456 » du registre est retiré du nom d'usage", () => {
    expect(suggererCopro(mail({ objet: "Résidence Les Acacias : fuite au 2e" }), ref).candidats).toEqual(["S0280"]);
  });

  it("un mot de rue d'une seule copro reste un nom (« Résidence Gallieni », S291 de syndic4)", () => {
    const r: ReferentielTri = {
      copros: [c("S0291", "GALLIENI6", "6 rue Maréchal Gallieni 78800 HOUILLES", ["RESIDENCE GALLIENI"]), c("S0300", "LESROSES", "3 rue des Roses 78800 HOUILLES")],
      expediteurs: {},
    };
    expect(suggererCopro(mail({ objet: "Résidence Gallieni - porte de garage" }), r).candidats).toEqual(["S0291"]);
  });
});

describe("un nom de rue composé n'est plus coupé au trait d'union (28/10/2026)", () => {
  // Adresse réelle d'une copro de syndic2 (registre national), numéros changés.
  const c = (reference: string, adresse: string): CoproTri => ({ reference, nom: `Copro ${reference}`, adresse, gestionnaire: null, assistant: null });
  const ref: ReferentielTri = { copros: [c("S0244", "4-6 r jean-baptiste hyacinthe lafolie 92250 La Garenne-Colombes")], expediteurs: {} };
  const trouve = (texte: string) => suggererCopro(mail({ objet: "Intervention", apercu: texte }), ref).candidats;

  it("« rue Jean » seule ne désigne plus la copro de la rue Jean-Baptiste Hyacinthe Lafolie", () => {
    expect(trouve("Fuite au 6 rue Jean Jaurès 92250 La Garenne-Colombes")).toEqual([]);
  });

  it("la rue complète la désigne toujours, et « 4-6 » reste deux numéros", () => {
    expect(trouve("Fuite au 6 rue Jean-Baptiste Hyacinthe Lafolie 92250 La Garenne-Colombes")).toEqual(["S0244"]);
    expect(trouve("Fuite au 4 rue Jean Baptiste Hyacinthe Lafolie 92250 La Garenne-Colombes")).toEqual(["S0244"]);
  });
});

describe("candidates qui mènent toutes au même dossier de binôme (28/10/2026)", () => {
  // Cas réel de syndic4 (anonymisé) : un prestataire cite deux copros de la même gestionnaire.
  const SOPHIE = "sophie@real31.fr";
  const copros: CoproTri[] = [
    copro("S0198", SOPHIE),
    copro("S0204", SOPHIE),
    { ...copro("S0206", SOPHIE), assistant: { nomComplet: "Nadia", email: "nadia@real31.fr" } },
    copro("S0261", "autre@real31.fr"),
    { ...copro("S0199", SOPHIE), inactive: true },
  ];
  const binomes = {
    binomes: [
      { id: "b1", gestionnaireEmail: SOPHIE, assistant: { nomComplet: "Clara", email: "clara@real31.fr" }, principal: true },
      { id: "b2", gestionnaireEmail: SOPHIE, assistant: { nomComplet: "Nadia", email: "nadia@real31.fr" }, principal: false },
    ],
    parCopro: {},
  };
  const ctx = {
    automatique: true,
    dejaPasse: false,
    copros,
    initialesParEmail: { [SOPHIE]: "SK", "clara@real31.fr": "CP", "nadia@real31.fr": "NF", "autre@real31.fr": "AU" },
    binomes,
  };
  const plusieurs = (...candidats: string[]) => ({ nature: "plusieurs" as const, candidats, raison: "" });

  it("rangé dans le dossier commun, étiqueté de chaque candidate", () => {
    expect(rangeableAutomatiquement({ suggestion: plusieurs("S0198", "S0204") }, ctx)).toEqual({
      ok: true,
      dossier: { cle: "binome:sophie@real31.fr", copros: ["S0198", "S0204"] },
    });
  });

  it("la vraie résolution du binôme : l'assistante de la fiche mène à un autre dossier (SK-NF)", () => {
    expect(rangeableAutomatiquement({ suggestion: plusieurs("S0198", "S0206") }, ctx)).toEqual({ ok: false, motif: "pas-sure" });
  });

  it("deux gestionnaires, une candidate inactive ou inconnue : à choisir", () => {
    expect(rangeableAutomatiquement({ suggestion: plusieurs("S0198", "S0261") }, ctx)).toEqual({ ok: false, motif: "pas-sure" });
    expect(rangeableAutomatiquement({ suggestion: plusieurs("S0198", "S0199") }, ctx)).toEqual({ ok: false, motif: "pas-sure" });
    expect(rangeableAutomatiquement({ suggestion: plusieurs("S0198", "S0999") }, ctx)).toEqual({ ok: false, motif: "pas-sure" });
  });

  it("jamais pour une piste faible, et pas deux fois", () => {
    expect(rangeableAutomatiquement({ suggestion: { nature: "faible", candidats: ["S0198"], raison: "" } }, ctx)).toEqual({ ok: false, motif: "pas-sure" });
    expect(rangeableAutomatiquement({ suggestion: plusieurs("S0198", "S0204") }, { ...ctx, dejaPasse: true })).toEqual({ ok: false, motif: "deja-passe" });
  });

  it("PDF : plusieurs copros du même dossier, rangé ; sinon refus", () => {
    const rien = { nature: "aucune" as const, candidats: [], raison: "" };
    expect(rangeableParPiecesJointes({ suggestion: rien }, ["S0198", "S0204"], ctx)).toEqual({ ok: true, dossier: { cle: "binome:sophie@real31.fr", copros: ["S0198", "S0204"] } });
    expect(rangeableParPiecesJointes({ suggestion: rien }, ["S0198", "S0261"], ctx)).toEqual({ ok: false, motif: "pj-plusieurs" });
    // Le mail propose d'autres copros que celles des PDF : un humain tranche.
    expect(rangeableParPiecesJointes({ suggestion: plusieurs("S0198", "S0261") }, ["S0198", "S0204"], ctx)).toEqual({ ok: false, motif: "pj-plusieurs" });
  });
});
