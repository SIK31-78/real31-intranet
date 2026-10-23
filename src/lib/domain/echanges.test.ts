import { describe, expect, it } from "vitest";
import {
  citationDe,
  envoyesDuBinome,
  sansCitation,
  boiteAutorisee,
  boitesVisibles,
  codesDeCopro,
  critereDepuisRecherche,
  fusionnerResultats,
  lienEchange,
  lireRefEchange,
  refEchange,
  resumeEchange,
  lireBoitesParAgence,
  requetesKql,
  sensDe,
  type EchangeTrouve,
} from "./echanges";

const PAR_AGENCE = lireBoitesParAgence("HLS=Syndic4@real31.fr ; LGC=syndic2@real31.fr,copro2@real31.fr;ML=");
const mylene = { email: "mylene@real31.fr", agence: "HLS", superAdmin: false };
const lgc = { email: "sandy@real31.fr", agence: "LGC", superAdmin: false };
const ml = { email: "x@real31.fr", agence: "ML", superAdmin: false };
const sekou = { email: "sekou.koma@real31.fr", agence: "LGC", superAdmin: true };

describe("qui voit quelles boîtes (décision du 12/10/2026)", () => {
  it("lit la configuration par agence", () => {
    expect(PAR_AGENCE).toEqual({ HLS: ["syndic4@real31.fr"], LGC: ["syndic2@real31.fr", "copro2@real31.fr"] });
  });

  it("chacun voit la boîte commune de son agence et la sienne ; une agence sans boîte n'a pas l'écran", () => {
    expect(boitesVisibles(mylene, PAR_AGENCE)).toEqual([
      { adresse: "syndic4@real31.fr", nature: "commune" },
      { adresse: "mylene@real31.fr", nature: "perso" },
    ]);
    expect(boitesVisibles(ml, PAR_AGENCE)).toEqual([]);
  });

  it("personne ne lit la boîte d'un collègue ni la commune d'une autre agence, sauf un super-admin", () => {
    expect(boiteAutorisee("syndic4@real31.fr", mylene, PAR_AGENCE)).toBe(true);
    expect(boiteAutorisee("sandy@real31.fr", mylene, PAR_AGENCE)).toBe(false);
    expect(boiteAutorisee("syndic2@real31.fr", mylene, PAR_AGENCE)).toBe(false);
    expect(boiteAutorisee("syndic4@real31.fr", lgc, PAR_AGENCE)).toBe(false);
    expect(boiteAutorisee("sandy@real31.fr", sekou, PAR_AGENCE)).toBe(true);
    expect(boiteAutorisee("quelquun@gmail.com", sekou, PAR_AGENCE)).toBe(false);
  });
});

describe("requetesKql", () => {
  it("cherche une copro par ses adresses OU son code, avec les autres critères", () => {
    expect(requetesKql({ copro: "S247", mots: "fuite hall", du: "2026-01-01" }, ["A@x.fr"], ["S247", "S0247"])).toEqual([
      "(participants:a@x.fr OR S247 OR S0247) AND fuite AND hall AND received>=2026-01-01",
    ]);
  });

  it("coupe une copro aux nombreuses adresses en plusieurs requêtes", () => {
    const adresses = Array.from({ length: 20 }, (_, i) => `p${i}@x.fr`);
    const r = requetesKql({ copro: "S247" }, adresses, ["S247"]);
    expect(r).toHaveLength(2);
    expect(r[0]).toContain("S247");
    expect(r[1]).not.toContain("S247");
  });

  it("un correspondant par adresse ou par nom ; rien sans critère ; les caractères dangereux sont retirés", () => {
    expect(requetesKql({ correspondant: "Jean@X.fr" }, [], [])).toEqual(["participants:jean@x.fr"]);
    expect(requetesKql({ correspondant: "Dupont" }, [], [])).toEqual(["(from:Dupont OR to:Dupont OR cc:Dupont)"]);
    expect(requetesKql({}, [], [])).toEqual([]);
    expect(requetesKql({ mots: 'devis" OR (x' }, [], [])).toEqual(["devis"]);
    expect(requetesKql({ du: "pas une date" }, [], [])).toEqual([]);
  });
});

describe("codes, sens et fusion", () => {
  it("une copro se cite S247 ou S0247", () => {
    expect(codesDeCopro("S0247")).toEqual(["S247", "S0247"]);
    expect(codesDeCopro("SE999")).toEqual(["SE999", "SE0999"]);
  });

  const e = (p: Partial<EchangeTrouve>): EchangeTrouve => ({
    boite: "syndic4@real31.fr",
    id: "1",
    internetMessageId: "<1>",
    objet: "",
    deNom: "",
    deAdresse: "client@x.fr",
    a: [],
    cc: [],
    date: "2026-10-01T00:00:00Z",
    aPiecesJointes: false,
    apercu: "",
    ...p,
  });

  it("distingue reçu, envoyé depuis la boîte et échange interne", () => {
    expect(sensDe(e({}))).toBe("recu");
    expect(sensDe(e({ deAdresse: "syndic4@real31.fr" }))).toBe("envoye");
    expect(sensDe(e({ deAdresse: "mylene@real31.fr" }))).toBe("interne");
  });

  it("fusionne sans doublon, du plus récent au plus ancien", () => {
    const r = fusionnerResultats(
      [[e({ internetMessageId: "<a>", date: "2026-01-01T00:00:00Z" })], [e({ internetMessageId: "<b>", date: "2026-02-01T00:00:00Z" }), e({ internetMessageId: "<a>" })]],
      10,
    );
    expect(r.map((x) => x.internetMessageId)).toEqual(["<b>", "<a>"]);
  });
});

describe("mail rattaché à un dossier", () => {
  it("la référence survit au déplacement du mail et rouvre le mail dans Échanges", () => {
    const ref = refEchange("Syndic4@real31.fr", "<abc|def@x>");
    expect(lireRefEchange(ref)).toEqual({ boite: "syndic4@real31.fr", internetMessageId: "<abc|def@x>" });
    expect(lireRefEchange("AAMkAD-ancien-id-graph")).toBeNull();
    expect(lienEchange("syndic4@real31.fr", "<a@b>")).toBe("/echanges?boite=syndic4%40real31.fr&mid=%3Ca%40b%3E");
  });

  it("résume le mail pour le journal du dossier", () => {
    const base = { boite: "syndic4@real31.fr", deNom: "Jean Dupont", deAdresse: "jean@x.fr", a: ["syndic4@real31.fr"], objet: "Fuite" };
    expect(resumeEchange(base)).toBe("Reçu de Jean Dupont : Fuite");
    expect(resumeEchange({ ...base, deAdresse: "syndic4@real31.fr", a: ["jean@x.fr"] })).toBe("Envoyé à jean@x.fr : Fuite");
  });
});

describe("critereDepuisRecherche (barre unique de E-mails)", () => {
  it("reconnaît le code copro, l'adresse et garde le reste en mots", () => {
    expect(critereDepuisRecherche("s0247 Dupont@X.fr fuite hall")).toEqual({ copro: "S0247", correspondant: "dupont@x.fr", mots: "fuite hall" });
    expect(critereDepuisRecherche("  devis ascenseur ")).toEqual({ mots: "devis ascenseur" });
    expect(critereDepuisRecherche("")).toEqual({});
  });
});

describe("réponse envoyée sans le message cité", () => {
  it("coupe à l'en-tête Outlook du message d'origine", () => {
    const corps = "Bonjour,\n\nC'est noté, le plombier passe jeudi.\n\nCordialement\n\nDe : Jean Dupont <jean@x.fr>\nEnvoyé : mardi\nObjet : fuite";
    expect(sansCitation(corps)).toBe("Bonjour,\n\nC'est noté, le plombier passe jeudi.\n\nCordialement");
  });
  it("coupe à « Le … a écrit : » et au séparateur", () => {
    expect(sansCitation("Merci.\r\n\r\nLe 14/10/2026 à 09:12, Jean a écrit :\r\n> fuite")).toBe("Merci.");
    expect(sansCitation("Ok.\n________________________________\nFrom: x")).toBe("Ok.");
  });
  it("garde tout quand rien n'est cité", () => {
    expect(sansCitation("  Bien reçu.  ")).toBe("Bien reçu.");
  });
  it("rend à part l'historique cité, borné", () => {
    const corps = "Merci.\r\n\r\nDe : Jean Dupont <jean@x.fr>\r\nObjet : fuite\r\n\r\n\r\n\r\nBonjour, une fuite.";
    expect(citationDe(corps)).toBe("De : Jean Dupont <jean@x.fr>\nObjet : fuite\n\nBonjour, une fuite.");
    expect(citationDe("  Bien reçu.  ")).toBe("");
    expect(citationDe("Ok.\nDe : x\nabcdef", 8)).toBe("De : x\na\n…");
  });
});

describe("envoyés d'une boîte partagée, filtrés au binôme", () => {
  const envoye = (id: string, conversationId?: string): EchangeTrouve => ({
    boite: "syndic9@exemple.fr",
    id,
    internetMessageId: `<${id}@exemple.fr>`,
    ...(conversationId ? { conversationId } : {}),
    objet: `Objet ${id}`,
    deNom: "Syndic 9",
    deAdresse: "syndic9@exemple.fr",
    a: ["client@exemple.fr"],
    cc: [],
    date: "2026-10-20T10:00:00Z",
    aPiecesJointes: false,
    apercu: "",
  });

  it("ne garde que les conversations distribuées au binôme, dans l'ordre", () => {
    const l = [envoye("1", "c-a"), envoye("2", "c-autre"), envoye("3"), envoye("4", "c-b"), envoye("5", "c-a")];
    expect(envoyesDuBinome(l, new Set(["c-a", "c-b"]), 30).map((e) => e.id)).toEqual(["1", "4", "5"]);
  });

  it("borne le nombre gardé et rend vide sans conversation connue", () => {
    const l = [envoye("1", "c-a"), envoye("2", "c-a"), envoye("3", "c-a")];
    expect(envoyesDuBinome(l, new Set(["c-a"]), 2).map((e) => e.id)).toEqual(["1", "2"]);
    expect(envoyesDuBinome(l, new Set(), 30)).toEqual([]);
  });
});
