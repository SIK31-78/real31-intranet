import { describe, expect, it } from "vitest";
import {
  adresseMailValide,
  adressesTouteLaCopro,
  conseilPourComposition,
  controleTouteLaCopro,
  enLots,
  sansPolitesseEnDouble,
  factureComplete,
  fusionnerContactsCopro,
  fusionnerModele,
  objetCompose,
  objetFactureEstale,
  prefixeObjetCopro,
  resumeDestinataires,
} from "./mes-emails-composition";

const copro = { reference: "S0247", nom: "Résidence Le Cyrano", adresse: "12 rue des Lilas 78400 Chatou" };

describe("objet auto-taggé copro", () => {
  it("met le code en tête (reconnu par le tri), puis le nom et l'adresse", () => {
    expect(prefixeObjetCopro(copro)).toBe("S0247 · Résidence Le Cyrano · 12 rue des Lilas 78400 Chatou");
  });

  it("garde l'adresse entière, même longue, et peut l'omettre", () => {
    // Cas réel S247 : l'objet partait avec « 78420 CARRIERES… ».
    const longue = { reference: "S0247", nom: "CYRANO", adresse: "16-18 Av Maréchal Juin / 56 r Gal Leclerc 78420 CARRIERES SUR SEINE" };
    expect(prefixeObjetCopro(longue)).toBe(`S0247 · CYRANO · ${longue.adresse}`);
    expect(prefixeObjetCopro(copro, false)).toBe("S0247 · Résidence Le Cyrano");
    // Le nom est l'adresse : on ne la répète pas (cas réel S0302).
    const peri = { reference: "S0302", nom: "44/50 rue Gabriel Péri", adresse: "44/50 Rue Gabriel Péri 78800 Houilles" };
    expect(prefixeObjetCopro(peri)).toBe("S0302 · 44/50 Rue Gabriel Péri 78800 Houilles");
    expect(prefixeObjetCopro(peri, false)).toBe("S0302 · 44/50 rue Gabriel Péri");
  });

  it("colle le sujet saisi après le préfixe identifiant", () => {
    expect(objetCompose(copro, "Fuite dans le hall", false)).toBe("S0247 · Résidence Le Cyrano - Fuite dans le hall");
    expect(objetCompose(copro, "  ", false)).toBe("S0247 · Résidence Le Cyrano");
  });
});

describe("fusion de modèle", () => {
  it("remplace les variables connues, vide celles absentes, signale les inconnues", () => {
    const r = fusionnerModele("Bonjour {{destinataire_nom}}, copro {{copro_code}}{{copro_nom}}. {{truc}}", {
      destinataire_nom: "M. Dupont",
      copro_code: "S0247",
    });
    expect(r).toBe("Bonjour M. Dupont, copro S0247. [truc]");
  });
});

describe("facture ESTALE", () => {
  it("exige les trois champs", () => {
    expect(factureComplete({ compte: "601000", fournisseur: "DGP", libelle: "" })).toBe(false);
    expect(factureComplete({ compte: "601000", fournisseur: "DGP NETTOYAGE", libelle: "Entretien EV" })).toBe(true);
  });

  it("compose l'objet codifié, fournisseur en capitales", () => {
    expect(objetFactureEstale({ compte: "601000", fournisseur: "Dgp Nettoyage", libelle: "Entretien EV" })).toBe(
      "601000 - DGP NETTOYAGE - Entretien EV",
    );
  });
});

describe("adresse acceptée à l'envoi", () => {
  it("accepte les adresses courantes", () => {
    for (const e of ["mylene.pin@real31.fr", "contact@fidec-services.fr", "o'brien+copro@mail.co.uk"]) expect(adresseMailValide(e)).toBe(true);
  });
  it("refuse une adresse accentuée ou mal formée, comme le serveur", () => {
    for (const e of ["mylène.pin@real31.fr", "jean dupont@real31.fr", "a@b", ".a@real31.fr", "a..b@real31.fr"]) expect(adresseMailValide(e)).toBe(false);
  });
});

describe("formule de politesse en double avec la signature", () => {
  const corps = "Madame, Monsieur,\n\nMerci d'intervenir.\n\nCordialement,";
  it("retire le Cordialement du modèle quand la signature en a déjà un", () => {
    expect(sansPolitesseEnDouble(corps, "<p>Bien cordialement</p><p>Nicolas PELOQUIN</p>")).toBe("Madame, Monsieur,\n\nMerci d'intervenir.\n");
  });
  it("le garde quand la signature n'en a pas", () => {
    expect(sansPolitesseEnDouble(corps, "<p>Nicolas PELOQUIN</p><p>REAL 31</p>")).toBe(corps);
    expect(sansPolitesseEnDouble(corps, null)).toBe(corps);
  });
  it("ne touche pas un modèle qui ne finit pas par une formule", () => {
    const sans = "Madame, Monsieur,\n\nCordialement, nous vous informons que la visite est maintenue.";
    expect(sansPolitesseEnDouble(sans, "Cordialement")).toBe(sans);
  });
});

describe("adressesTouteLaCopro", () => {
  it("garde copropriétaires et conseil syndical, sans locataires ni pros, sans doublon", () => {
    const contacts = [
      { email: "B@x.fr", nom: "B", qualite: "coproprietaire" },
      { email: "a@x.fr", nom: "A", qualite: "conseil_syndical" },
      { email: "b@x.fr", nom: "B bis", qualite: "coproprietaire" },
      { email: "loc@x.fr", nom: "L", qualite: "locataire" },
      { email: "plombier@x.fr", nom: "P", qualite: "professionnel" },
      { email: "pas une adresse", nom: "Z", qualite: "coproprietaire" },
    ];
    expect(adressesTouteLaCopro(contacts)).toEqual(["a@x.fr", "b@x.fr"]);
  });

  it("chacun des deux membres d'un couple reçoit le mail", () => {
    const couple = [
      { email: "monsieur@x.fr", nom: "M. et Mme DURAND", qualite: "coproprietaire" },
      { email: "madame@x.fr", nom: "M. et Mme DURAND", qualite: "coproprietaire" },
    ];
    expect(adressesTouteLaCopro(couple)).toHaveLength(2);
  });
});

describe("fusionnerContactsCopro (REA-356)", () => {
  const crypto = [
    { email: "ancien@x.fr", nom: "ANCIEN", qualite: "coproprietaire", personne: "crypto:1" },
    { email: "cs.crypto@x.fr", nom: "CS CRYPTO", qualite: "conseil_syndical", personne: "crypto:2" },
    { email: "loc@x.fr", nom: "LOCATAIRE", qualite: "locataire" },
    { email: "Plombier@x.fr", nom: "PLOMBIER", qualite: "professionnel", metier: "Plomberie" },
  ];

  it("copro ESTALE : les copropriétaires Crypto sont remplacés par ceux d'ESTALE, locataires et pros restent", () => {
    const r = fusionnerContactsCopro(crypto, [{ id: "o1", nom: "M. ACTUEL", email: " Actuel@X.fr " }], []);
    expect(r.map((c) => [c.email, c.qualite])).toEqual([
      ["loc@x.fr", "locataire"],
      ["Plombier@x.fr", "professionnel"],
      ["actuel@x.fr", "coproprietaire"],
    ]);
    expect(r.find((c) => c.email === "actuel@x.fr")).toMatchObject({ nom: "M. ACTUEL", personne: "estale:o1" });
  });

  it("copro ESTALE : le conseil syndical ESTALE marque le propriétaire, un membre absent est ajouté", () => {
    const r = fusionnerContactsCopro(crypto, [{ id: "o1", nom: "M. ACTUEL", email: "actuel@x.fr" }], [
      { nomComplet: "M. ACTUEL", email: "ACTUEL@x.fr" },
      { nomComplet: "Mme AUTRE", email: "autre@x.fr" },
      { nomComplet: "Sans adresse" },
    ]);
    expect(r.filter((c) => c.qualite === "conseil_syndical").map((c) => [c.email, c.personne])).toEqual([
      ["actuel@x.fr", "estale:o1"],
      ["autre@x.fr", undefined],
    ]);
  });

  it("copro hors ESTALE (ou ESTALE en panne) : l'annuaire Crypto tel quel, complété du CS ESTALE", () => {
    const r = fusionnerContactsCopro(crypto, null, [{ nomComplet: "X", email: "ancien@x.fr" }]);
    expect(r).toHaveLength(4);
    expect(r[0]).toMatchObject({ email: "ancien@x.fr", qualite: "conseil_syndical", personne: "crypto:1" });
  });

  it("copro ESTALE sans aucun propriétaire joignable : plus aucun copropriétaire Crypto", () => {
    expect(adressesTouteLaCopro(fusionnerContactsCopro(crypto, [], []))).toEqual([]);
  });
});

describe("controleTouteLaCopro (REA-356)", () => {
  const copro = (email: string, personne?: string, nom = "", qualite = "coproprietaire") => ({
    email,
    nom,
    qualite,
    ...(personne ? { personne } : {}),
  });

  it("compte les adresses et les personnes (une fiche et ses correspondants = une personne)", () => {
    const r = controleTouteLaCopro([
      copro("a@x.fr", "crypto:1"),
      copro("a.bureau@x.fr", "crypto:1"),
      copro("b@x.fr", "crypto:2", "", "conseil_syndical"),
      copro("loc@x.fr", "crypto:3", "", "locataire"),
      copro("invalide", "crypto:4"),
    ]);
    expect(r).toEqual({ adresses: 3, coproprietaires: 2, resume: "3 adresses pour 2 copropriétaires", alerte: null });
  });

  it("sans identifiant de personne : le nom, puis l'adresse", () => {
    const r = controleTouteLaCopro([copro("a@x.fr", undefined, "Mme Éva DUPONT"), copro("b@x.fr", undefined, "mme eva dupont"), copro("c@x.fr")]);
    expect(r).toMatchObject({ adresses: 3, coproprietaires: 2 });
  });

  it("alerte au-delà de 2,5 adresses par copropriétaire", () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((l) => copro(`${l}@x.fr`, "crypto:1"));
    expect(controleTouteLaCopro(six).alerte).toBe("Vérifiez la liste : 6 adresses pour 1 copropriétaire, c'est beaucoup d'adresses par personne.");
    expect(controleTouteLaCopro(six.slice(0, 2)).alerte).toBeNull();
  });

  it("alerte quand il y a plus de copropriétaires que de lots principaux, si on les connaît", () => {
    const trois = [copro("a@x.fr", "crypto:1"), copro("b@x.fr", "crypto:2"), copro("c@x.fr", "crypto:3")];
    expect(controleTouteLaCopro(trois, 2).alerte).toMatch(/^Vérifiez la liste : 3 copropriétaires pour 2 lots principaux/);
    expect(controleTouteLaCopro(trois, 3).alerte).toBeNull();
    expect(controleTouteLaCopro(trois, null).alerte).toBeNull();
    expect(controleTouteLaCopro(trois, 0).alerte).toBeNull();
  });
});

describe("enLots", () => {
  it("découpe sous la limite d'Exchange", () => {
    const liste = Array.from({ length: 1000 }, (_, i) => `c${i}@x.fr`);
    const lots = enLots(liste);
    expect(lots.map((l) => l.length)).toEqual([450, 450, 100]);
    expect(lots.flat()).toEqual(liste);
  });

  it("une liste vide ne donne aucun lot", () => {
    expect(enLots([])).toEqual([]);
  });
});

describe("resumeDestinataires (REA-349)", () => {
  it("nomme un ou deux destinataires", () => {
    expect(resumeDestinataires(["a@x.fr"])).toBe("a@x.fr");
    expect(resumeDestinataires(["Mme Pin", "b@x.fr"])).toBe("Mme Pin et b@x.fr");
  });
  it("résume au-delà de deux, sans doublon ni vide", () => {
    expect(resumeDestinataires(["a", "b", "c", "a", " "])).toBe("a, b et 1 autre");
    expect(resumeDestinataires(["a", "b", "c", "d"])).toBe("a, b et 2 autres");
  });
  it("dit qu'il n'y a personne de visible", () => {
    expect(resumeDestinataires([])).toBe("aucun destinataire visible");
  });
});

describe("conseilPourComposition (20/10/2026)", () => {
  const contacts = [
    { email: "couple.durand@x.fr", nom: "M. et Mme DURAND", qualite: "conseil_syndical" },
    { email: "paul.durand@x.fr", nom: "M. DURAND Paul", qualite: "conseil_syndical" },
    { email: "martin@x.fr", nom: "Mme MARTIN", qualite: "coproprietaire" },
  ];

  it("ne propose que les adresses de la cascade, nommées depuis les contacts", () => {
    const r = conseilPourComposition({ source: "crypto", emails: [" Martin@X.fr", "inconnu@x.fr"] }, contacts);
    expect(r).toEqual({
      source: "crypto",
      membres: [
        { email: "martin@x.fr", nom: "Mme MARTIN", qualite: "conseil_syndical" },
        { email: "inconnu@x.fr", nom: "", qualite: "conseil_syndical" },
      ],
    });
  });

  it("dédoublonne sans casse et écarte une adresse invalide", () => {
    const r = conseilPourComposition({ source: "estale", emails: ["a@x.fr", "A@x.fr", "pas-une-adresse"] }, []);
    expect(r.membres.map((m) => m.email)).toEqual(["a@x.fr"]);
    expect(r.source).toBe("estale");
  });

  it("aucune adresse exploitable : source « aucune », saisie à la main", () => {
    expect(conseilPourComposition({ source: "crypto", emails: ["pas-une-adresse"] }, contacts)).toEqual({ source: "aucune", membres: [] });
    expect(conseilPourComposition({ source: "aucune", emails: [] }, contacts)).toEqual({ source: "aucune", membres: [] });
  });
});
