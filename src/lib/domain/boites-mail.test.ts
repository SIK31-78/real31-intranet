import { describe, expect, it } from "vitest";
import { boiteAutorisee, boiteReponseParDefaut, construireBoites } from "./boites-mail";

describe("construireBoites", () => {
  it("met la boite personnelle en premier, puis les partagees dans l'ordre configure", () => {
    const b = construireBoites("Sekou.Koma@real31.fr", "syndic2@real31.fr, syndic4@real31.fr");
    expect(b.map((x) => x.id)).toEqual([
      "sekou.koma@real31.fr",
      "syndic2@real31.fr",
      "syndic4@real31.fr",
    ]);
    expect(b[0]).toMatchObject({ libelle: "Ma boîte", personnelle: true });
    expect(b[1]).toMatchObject({ libelle: "syndic2", personnelle: false });
  });

  it("normalise la casse et les espaces (l'adresse est l'identifiant)", () => {
    const b = construireBoites("  SEKOU.KOMA@REAL31.FR ", "  SYNDIC2@Real31.fr  ");
    expect(b.map((x) => x.id)).toEqual(["sekou.koma@real31.fr", "syndic2@real31.fr"]);
  });

  it("ignore les entrees vides ou sans @ plutot que de creer une boite fantome", () => {
    const b = construireBoites("a@real31.fr", "syndic2@real31.fr,,  ,pas-une-adresse");
    expect(b.map((x) => x.id)).toEqual(["a@real31.fr", "syndic2@real31.fr"]);
  });

  it("ne duplique pas une partagee identique a la personnelle", () => {
    const b = construireBoites("syndic2@real31.fr", "syndic2@real31.fr");
    expect(b).toHaveLength(1);
    expect(b[0]!.personnelle).toBe(true);
  });

  it("sans email de gestionnaire : aucune boite personnelle, les partagees restent", () => {
    expect(construireBoites(undefined, "syndic2@real31.fr").map((x) => x.id)).toEqual([
      "syndic2@real31.fr",
    ]);
    expect(construireBoites("", "")).toEqual([]);
  });
});

describe("boiteAutorisee (garde serveur : le 'De :' vient du client)", () => {
  const boites = construireBoites("a@real31.fr", "syndic2@real31.fr");

  it("accepte une boite de la liste, quelle que soit la casse", () => {
    expect(boiteAutorisee(boites, "SYNDIC2@real31.fr")).toBe(true);
  });

  it("REFUSE une boite absente de la liste", () => {
    expect(boiteAutorisee(boites, "syndic1@real31.fr")).toBe(false);
    expect(boiteAutorisee(boites, "")).toBe(false);
  });
});

describe("boiteReponseParDefaut", () => {
  const boites = construireBoites("a@real31.fr", "syndic2@real31.fr");

  it("repond depuis la boite qui a recu le mail (le fil reste unifie)", () => {
    expect(boiteReponseParDefaut(boites, "syndic2@real31.fr")).toBe("syndic2@real31.fr");
  });

  it("repli sur la boite personnelle si le mail vient d'ailleurs ou d'une boite inconnue", () => {
    expect(boiteReponseParDefaut(boites, undefined)).toBe("a@real31.fr");
    expect(boiteReponseParDefaut(boites, "inconnue@real31.fr")).toBe("a@real31.fr");
  });

  it("sans boite du tout, rend une chaine vide plutot que de planter", () => {
    expect(boiteReponseParDefaut([], "x@real31.fr")).toBe("");
  });
});
