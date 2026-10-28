import { describe, expect, it } from "vitest";
import { nonLusATraiter, pastilleEmails, placeInternesValide, regrouperInternes, traitesAuChargement } from "./mes-emails-liste";
import { construireBoites, regrouperPartagees } from "./boites-mail";

const mails = [
  { id: "1", expediteurEmail: "client@gmail.com" },
  { id: "2", expediteurEmail: "Elsa@REAL31.fr" },
  { id: "3", expediteurEmail: "syndic@autre.fr" },
  { id: "4", expediteurEmail: "nicolas@real31.fr" },
  { id: "5", expediteurEmail: "moi@real31.fr" },
];
const boite = () => "moi@real31.fr";
const ids = (l: { id: string }[]) => l.map((m) => m.id);

describe("regrouperInternes (REA-351)", () => {
  it("« mêlés » garde l'ordre reçu", () => {
    expect(ids(regrouperInternes(mails, "meles", boite))).toEqual(["1", "2", "3", "4", "5"]);
  });
  it("en haut : les collègues d'abord, chaque groupe dans son ordre", () => {
    expect(ids(regrouperInternes(mails, "haut", boite))).toEqual(["2", "4", "1", "3", "5"]);
  });
  it("en bas : les collègues à la fin", () => {
    expect(ids(regrouperInternes(mails, "bas", boite))).toEqual(["1", "3", "5", "2", "4"]);
  });
  it("un mail envoyé depuis sa propre boîte n'est pas d'un collègue", () => {
    expect(ids(regrouperInternes(mails, "haut", boite))).not.toContain(undefined);
    expect(ids(regrouperInternes(mails, "haut", boite)).indexOf("5")).toBeGreaterThan(1);
  });
  it("ne modifie pas la liste d'origine", () => {
    const copie = [...mails];
    regrouperInternes(mails, "haut", boite);
    expect(mails).toEqual(copie);
  });
});

describe("placeInternesValide", () => {
  it("accepte les valeurs connues, retombe sur « mêlés » sinon", () => {
    expect(placeInternesValide("haut")).toBe("haut");
    expect(placeInternesValide("bas")).toBe("bas");
    expect(placeInternesValide("n'importe")).toBe("meles");
    expect(placeInternesValide(null)).toBe("meles");
  });
});

describe("traitesAuChargement (REA-422 : plus d'onglet « Conclus »)", () => {
  const boites = [
    { id: "moi@real31.fr", personnelle: true },
    { id: "syndic4@real31.fr", personnelle: false },
  ];
  it("boîte partagée : « Marquer traité » sort le mail de « À traiter »", () => {
    const r = traitesAuChargement(
      [
        { id: "p1", boite: "syndic4@real31.fr", statutTraitement: "classe" },
        { id: "p2", boite: "syndic4@real31.fr", statutTraitement: "repondu" },
        { id: "p3", boite: "syndic4@real31.fr" },
      ],
      boites,
    );
    expect([...r]).toEqual(["p1"]);
  });
  it("boîte perso : Outlook fait foi, un mail encore en réception reste à traiter", () => {
    const r = traitesAuChargement(
      [
        { id: "m1", boite: "moi@real31.fr", statutTraitement: "classe" },
        { id: "m2", statutTraitement: "classe" },
      ],
      boites,
    );
    expect(r.size).toBe(0);
  });
});

describe("nonLusATraiter : le compteur de chaque onglet de boîte (27/10/2026)", () => {
  const liste = [
    { id: "a", boite: "moi@real31.fr" },
    { id: "b", boite: "moi@real31.fr" },
    { id: "c", boite: "syndic2@real31.fr" },
    { id: "d", boite: "syndic2@real31.fr" },
    { id: "e" },
  ];
  it("non lus, encore à traiter, de cette boîte (sans boîte : la boîte par défaut)", () => {
    expect(nonLusATraiter(liste, "moi@real31.fr", "moi@real31.fr", new Set(["a"]), new Set())).toBe(2);
    expect(nonLusATraiter(liste, "syndic2@real31.fr", "moi@real31.fr", new Set(), new Set(["c"]))).toBe(1);
    expect(nonLusATraiter(liste, "syndic2@real31.fr", "moi@real31.fr", new Set(["d"]), new Set(["c"]))).toBe(0);
  });

  it("l'onglet Comptabilité d'un comptable compte les deux boîtes (28/10/2026)", () => {
    const boites = regrouperPartagees(construireBoites("moi@real31.fr", "syndic2@real31.fr,syndic4@real31.fr"), "Comptabilité");
    const avecS4 = [...liste, { id: "f", boite: "syndic4@real31.fr" }];
    expect(nonLusATraiter(avecS4, "syndic2@real31.fr", "moi@real31.fr", new Set(["d"]), new Set(), boites)).toBe(2);
    expect(nonLusATraiter(avecS4, "moi@real31.fr", "moi@real31.fr", new Set(), new Set(), boites)).toBe(3);
  });
});

describe("pastilleEmails : la pastille rouge de « E-mails » (27/10/2026)", () => {
  it("boîte perso : les non lus d'Outlook de la fenêtre de l'écran", () => {
    expect(pastilleEmails([new Map([["1", false], ["2", true], ["3", false]])], [], 80)).toBe(2);
  });

  it("boîte partagée : distribués, moins traités, moins ouverts dans l'intranet", () => {
    const p = { distribues: ["a", "b", "c", "d"], traites: new Set(["a"]), lusIntranet: new Set(["b"]) };
    expect(pastilleEmails([], [p], 80)).toBe(2);
  });

  it("borne chaque boîte partagée aux derniers distribués que l'écran lit, et additionne les boîtes", () => {
    const p = { distribues: ["a", "b", "c", "d"], traites: new Set<string>(), lusIntranet: new Set<string>() };
    expect(pastilleEmails([new Map([["x", false]])], [p, p], 3)).toBe(7);
  });

  it("rien à compter : 0", () => {
    expect(pastilleEmails([], [], 80)).toBe(0);
  });
});
