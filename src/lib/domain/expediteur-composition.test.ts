import { describe, expect, it } from "vitest";
import {
  expediteurApresCopro,
  expediteurAutorise,
  expediteursComposition,
  touteLaCoproPossibleDepuis,
  type ExpediteurComposition,
} from "./expediteur-composition";

// Les boîtes de la config du 27/10/2026 : syndic2 sert La Garenne et Asnières, syndic4 Houilles.
const boites = [
  { boite: "syndic2@real31.fr", agences: ["LGC", "ASN"] },
  { boite: "syndic4@real31.fr", agences: ["HLS"] },
];
const ids = (l: ExpediteurComposition[]) => l.map((e) => e.boite);

describe("expediteursComposition", () => {
  it("gestionnaire de La Garenne : la boîte de son agence (par défaut) et sa boîte perso", () => {
    const r = expediteursComposition({ agence: "LGC", superAdmin: false, comptable: false, boites, perso: "Nicolas@Real31.fr" });
    expect(ids(r.expediteurs)).toEqual(["syndic2@real31.fr", "nicolas@real31.fr"]);
    expect(r.expediteurs[1]?.personnelle).toBe(true);
    expect(r.parDefaut).toBe("syndic2@real31.fr");
  });

  it("gestionnaire de Houilles : syndic4, jamais syndic2", () => {
    const r = expediteursComposition({ agence: "hls", superAdmin: false, comptable: false, boites, perso: "x@real31.fr" });
    expect(ids(r.expediteurs)).toEqual(["syndic4@real31.fr", "x@real31.fr"]);
  });

  it("comptable de La Garenne : syndic2 d'abord, syndic4 ensuite, puis sa boîte perso", () => {
    const r = expediteursComposition({ agence: "LGC", superAdmin: false, comptable: true, boites, perso: "elsa@real31.fr" });
    expect(ids(r.expediteurs)).toEqual(["syndic2@real31.fr", "syndic4@real31.fr", "elsa@real31.fr"]);
    expect(r.parDefaut).toBe("syndic2@real31.fr");
  });

  it("super-admin de Houilles : sa boîte d'agence en tête, toutes les autres, sa boîte perso", () => {
    const r = expediteursComposition({ agence: "HLS", superAdmin: true, comptable: false, boites, perso: "sk@real31.fr" });
    expect(ids(r.expediteurs)).toEqual(["syndic4@real31.fr", "syndic2@real31.fr", "sk@real31.fr"]);
  });

  it("super-admin sans agence : la première boîte de la config par défaut, comme avant", () => {
    const r = expediteursComposition({ agence: null, superAdmin: true, comptable: false, boites, perso: "sk@real31.fr" });
    expect(r.parDefaut).toBe("syndic2@real31.fr");
  });

  it("agence sans boîte triée : la boîte perso seule", () => {
    const r = expediteursComposition({ agence: "ML", superAdmin: false, comptable: false, boites, perso: "ml@real31.fr" });
    expect(ids(r.expediteurs)).toEqual(["ml@real31.fr"]);
    expect(r.parDefaut).toBe("ml@real31.fr");
  });

  it("incarnation (pas de boîte perso) : les boîtes partagées seulement", () => {
    const r = expediteursComposition({ agence: "LGC", superAdmin: false, comptable: true, boites, perso: null });
    expect(r.expediteurs.every((e) => !e.personnelle)).toBe(true);
    expect(ids(r.expediteurs)).toEqual(["syndic2@real31.fr", "syndic4@real31.fr"]);
  });

  it("rien du tout : aucune boîte, aucun défaut", () => {
    expect(expediteursComposition({ agence: undefined, superAdmin: false, comptable: false, boites, perso: "" })).toEqual({ expediteurs: [], parDefaut: null });
  });
});

describe("expediteurAutorise", () => {
  const { expediteurs } = expediteursComposition({ agence: "LGC", superAdmin: false, comptable: false, boites, perso: "nicolas@real31.fr" });
  it("accepte une boîte de la liste, sans casse", () => {
    expect(expediteurAutorise(expediteurs, " NICOLAS@real31.fr ")?.personnelle).toBe(true);
  });
  it("refuse une boîte hors liste (autre agence, adresse fabriquée)", () => {
    expect(expediteurAutorise(expediteurs, "syndic4@real31.fr")).toBeNull();
    expect(expediteurAutorise(expediteurs, "collegue@real31.fr")).toBeNull();
  });
  it("sans demande : la boîte de l'ouverture", () => {
    expect(expediteurAutorise(expediteurs, undefined)?.boite).toBe("syndic2@real31.fr");
    expect(expediteurAutorise([], undefined)).toBeNull();
  });
});

describe("expediteurApresCopro", () => {
  const { expediteurs } = expediteursComposition({ agence: "LGC", superAdmin: false, comptable: true, boites, perso: "elsa@real31.fr" });

  it("Elsa choisit une copro de Houilles : la boîte passe sur syndic4, d'elle-même", () => {
    expect(expediteurApresCopro({ boite: "syndic2@real31.fr", manuel: false }, "syndic4@real31.fr", expediteurs)).toEqual({
      boite: "syndic4@real31.fr",
      manuel: false,
      change: true,
    });
  });

  it("une copro de la boîte déjà choisie : rien ne bouge", () => {
    expect(expediteurApresCopro({ boite: "syndic4@real31.fr", manuel: true }, "syndic4@real31.fr", expediteurs)).toEqual({
      boite: "syndic4@real31.fr",
      manuel: true,
      change: false,
    });
  });

  it("la boîte perso choisie à la main tient, quelle que soit la copro", () => {
    expect(expediteurApresCopro({ boite: "elsa@real31.fr", manuel: true }, "syndic4@real31.fr", expediteurs).boite).toBe("elsa@real31.fr");
  });

  it("une boîte partagée choisie à la main qui ne sert pas la copro cède à celle de la copro", () => {
    expect(expediteurApresCopro({ boite: "syndic2@real31.fr", manuel: true }, "syndic4@real31.fr", expediteurs)).toEqual({
      boite: "syndic4@real31.fr",
      manuel: false,
      change: true,
    });
  });

  it("pas de copro, ou une copro dont la boîte n'est pas proposée : rien ne bouge", () => {
    const etat = { boite: "syndic2@real31.fr", manuel: false };
    expect(expediteurApresCopro(etat, null, expediteurs).change).toBe(false);
    expect(expediteurApresCopro(etat, "syndic1@real31.fr", expediteurs).change).toBe(false);
    // Une « boîte de copro » qui serait la perso n'est jamais une cible automatique.
    expect(expediteurApresCopro(etat, "elsa@real31.fr", expediteurs).change).toBe(false);
  });
});

describe("touteLaCoproPossibleDepuis", () => {
  it("boîte partagée oui, boîte perso non", () => {
    expect(touteLaCoproPossibleDepuis({ personnelle: false })).toBe(true);
    expect(touteLaCoproPossibleDepuis({ personnelle: true })).toBe(false);
    expect(touteLaCoproPossibleDepuis(null)).toBe(false);
  });
});
