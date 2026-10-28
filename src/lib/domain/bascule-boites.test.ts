import { describe, expect, it } from "vitest";
import { boiteDeBascule, cleBascule, estBascule, memesPieces, nomBascule, refusBascule, type EtatBascule } from "./bascule-boites";

const ouvert: EtatBascule = {
  source: "syndic4@real31.fr",
  cible: "syndic2@real31.fr",
  cibleConfiguree: true,
  ecritureSource: true,
  ecritureCible: true,
  graph: true,
};

describe("clé de journal d'une bascule", () => {
  it("aller et retour entre la clé et la boîte cible", () => {
    expect(cleBascule(" Syndic2@Real31.fr ")).toBe("bascule:syndic2@real31.fr");
    expect(boiteDeBascule("bascule:syndic2@real31.fr")).toBe("syndic2@real31.fr");
    expect(nomBascule("syndic2@real31.fr")).toBe("Basculé vers syndic2@real31.fr");
  });

  it("un rangement ordinaire n'est pas une bascule", () => {
    expect(boiteDeBascule("binome:x@real31.fr")).toBeNull();
    expect(boiteDeBascule("bascule:")).toBeNull();
    expect(estBascule({ dossierCle: null })).toBe(false);
    expect(estBascule({ dossierCle: "corbeille" })).toBe(false);
    expect(estBascule({ dossierCle: "bascule:syndic4@real31.fr" })).toBe(true);
  });
});

describe("refusBascule : l'écriture doit être ouverte sur les deux boîtes", () => {
  it("permise quand tout est ouvert", () => {
    expect(refusBascule(ouvert)).toBeNull();
  });

  it("refus lisible, en nommant la ou les boîtes fermées", () => {
    expect(refusBascule({ ...ouvert, ecritureCible: false })).toMatch(/coupée sur syndic2@real31\.fr :/);
    expect(refusBascule({ ...ouvert, ecritureSource: false, ecritureCible: false })).toMatch(/syndic4@real31\.fr et syndic2@real31\.fr/);
  });

  it("pas de vrai Graph : refus (pas de bascule simulée)", () => {
    expect(refusBascule({ ...ouvert, graph: false })).toMatch(/MAIL_SOURCE=graph/);
  });

  it("cible hors config, même boîte, mail hors boîte triée", () => {
    expect(refusBascule({ ...ouvert, cibleConfiguree: false })).toMatch(/pas une boîte triée/);
    expect(refusBascule({ ...ouvert, cible: "syndic4@real31.fr" })).toMatch(/déjà dans cette boîte/);
    expect(refusBascule({ ...ouvert, source: null })).toMatch(/pas dans une boîte triée/);
  });
});

describe("memesPieces : une copie complète a toutes les pièces de l'original", () => {
  const a = { nom: "facture.pdf", isInline: false };
  const img = { nom: "image001.png", isInline: true };

  it("mêmes pièces, dans n'importe quel ordre", () => {
    expect(memesPieces([a, img], [img, a])).toBe(true);
    expect(memesPieces([], [])).toBe(true);
  });

  it("une pièce manquante, en trop, ou devenue « en ligne » : incomplète", () => {
    expect(memesPieces([a, img], [a])).toBe(false);
    expect(memesPieces([a], [a, a])).toBe(false);
    expect(memesPieces([a], [{ ...a, isInline: true }])).toBe(false);
  });

  it("deux pièces du même nom comptent deux fois", () => {
    expect(memesPieces([a, a], [a, a])).toBe(true);
    expect(memesPieces([a, a], [a, img])).toBe(false);
  });
});
