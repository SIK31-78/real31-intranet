// Plafonds d'upload : le domaine PUR qui decide si un lot passe. Le point sensible est le MUR
// VERCEL (~4,5 Mo de body serverless en production) : sans lui, un admin se prend un echec opaque
// APRES l'upload. Local = plafonds actuels inchanges (retro-compat).

import { describe, it, expect } from "vitest";
import {
  verifierTailleLot,
  TAILLE_TOTALE_MAX_OCTETS,
  TAILLE_UPLOAD_MAX_PROD_OCTETS,
  enMo,
  estNomGrandLivre,
} from "./limites-upload";

const MO = 1024 * 1024;

describe("verifierTailleLot - LOCAL (NODE_ENV != production)", () => {
  it("un lot de 30 Mo passe (plafond local 40 Mo, inchange)", () => {
    expect(verifierTailleLot(30 * MO, false)).toBeNull();
  });

  it("pile au plafond RAM -> passe", () => {
    expect(verifierTailleLot(TAILLE_TOTALE_MAX_OCTETS, false)).toBeNull();
  });

  it("au-dela du plafond RAM -> message actionnable (le message historique)", () => {
    const m = verifierTailleLot(41 * MO, false);
    expect(m).toContain("41 Mo");
    expect(m).toContain("40 Mo");
  });
});

describe("verifierTailleLot - PRODUCTION (le mur Vercel)", () => {
  it("un lot de 3 Mo passe", () => {
    expect(verifierTailleLot(3 * MO, true)).toBeNull();
  });

  it("pile au plafond prod -> passe", () => {
    expect(verifierTailleLot(TAILLE_UPLOAD_MAX_PROD_OCTETS, true)).toBeNull();
  });

  it("10 Mo en prod -> refus AVANT upload, message qui dit quoi faire", () => {
    const m = verifierTailleLot(10 * MO, true);
    expect(m).not.toBeNull();
    expect(m).toContain("10 Mo");
    expect(m).toContain("Vercel");
    expect(m).toContain("poste local");
  });

  it("le plafond prod prime sur le plafond RAM (un lot de 50 Mo parle de Vercel, pas de 40 Mo)", () => {
    const m = verifierTailleLot(50 * MO, true);
    expect(m).toContain("Vercel");
  });
});

describe("enMo", () => {
  it("arrondit a l'entier superieur (jamais 0 Mo pour un fichier non vide)", () => {
    expect(enMo(1)).toBe(1);
    expect(enMo(2 * MO)).toBe(2);
    expect(enMo(2 * MO + 1)).toBe(3);
  });
});

describe("estNomGrandLivre", () => {
  it("reconnait les libelles et le sigle isole", () => {
    expect(estNomGrandLivre("Grand Livre 2025.pdf")).toBe(true);
    expect(estNomGrandLivre("grand_livre.pdf")).toBe(true);
    expect(estNomGrandLivre("S0302-GL.pdf")).toBe(true);
  });

  it("ne se declenche pas sur un GL au milieu d'un mot", () => {
    expect(estNomGrandLivre("angle-de-rue.pdf")).toBe(false);
    expect(estNomGrandLivre("EDD.pdf")).toBe(false);
  });
});
