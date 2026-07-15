// Tests des listes de diffusion Crypto (increment 2 "dates CS/AG"). Fonctions PURES :
// parsing CSV, classification, extraction de reference copro, destinataires nettoyes.
// Les lignes CSV sont SYNTHETIQUES (adresses inventees @example.test) : aucune PII.

import { describe, it, expect } from "vitest";
import {
  classifierListe,
  destinatairesListe,
  estEmailInterne,
  extraireRefCopro,
  normaliserRefCopro,
  parseListesDiffusion,
} from "./listes-diffusion";

describe("normaliserRefCopro", () => {
  it("retire le prefixe zeros : S046 -> S46", () => {
    expect(normaliserRefCopro("S046")).toBe("S46");
    expect(normaliserRefCopro(" s 46 ".replace(/\s/g, ""))).toBe("S46");
    expect(normaliserRefCopro("S274")).toBe("S274");
  });
});

describe("classifierListe", () => {
  it("designation 'Conseil Syndical ...' -> conseil_syndical (insensible a la casse)", () => {
    expect(classifierListe("Conseil Syndical - S046")).toBe("conseil_syndical");
    expect(classifierListe("conseil syndical - S236")).toBe("conseil_syndical");
  });

  it("designation 'PROPRIETAIRES' -> proprietaires", () => {
    expect(classifierListe("57 AIGLE NU PROPRIETAIRES")).toBe("proprietaires");
  });

  it("liste interne cabinet sans reference -> autre", () => {
    expect(classifierListe("SIK NP")).toBe("autre");
    expect(classifierListe("")).toBe("autre");
  });
});

describe("extraireRefCopro", () => {
  it("extrait et normalise la reference embarquee dans la designation", () => {
    expect(extraireRefCopro("Conseil Syndical - S046")).toBe("S46");
    expect(extraireRefCopro("Conseil syndical - S236")).toBe("S236");
  });

  it("ne confond pas 'Syndical' / 'SARTROUVILLE' avec une reference", () => {
    expect(extraireRefCopro("Conseil Syndical de SARTROUVILLE")).toBeNull();
  });

  it("designation sans reference -> null (pas de rapprochement)", () => {
    expect(extraireRefCopro("57 AIGLE NU PROPRIETAIRES")).toBeNull();
    expect(extraireRefCopro("")).toBeNull();
  });
});

describe("estEmailInterne", () => {
  it("adresse @real31.fr = interne (exclue du pre-remplissage)", () => {
    expect(estEmailInterne("remi.bard@real31.fr")).toBe(true);
    expect(estEmailInterne("membre@example.test")).toBe(false);
  });
});

describe("destinatairesListe", () => {
  it("fusionne a+cc+cci, exclut les internes REAL31, deduplique, garde l'ordre", () => {
    const r = destinatairesListe({
      a: ["pres@example.test", "gestionnaire@real31.fr"],
      cc: ["membre1@example.test", "PRES@example.test"],
      cci: ["membre2@example.test"],
    });
    expect(r).toEqual(["pres@example.test", "membre1@example.test", "membre2@example.test"]);
  });

  it("ignore les entrees vides ou mal formees", () => {
    const r = destinatairesListe({ a: ["pasunemail", "", "ok@example.test"], cc: [], cci: [] });
    expect(r).toEqual(["ok@example.test"]);
  });
});

describe("parseListesDiffusion", () => {
  const CSV = [
    "idref;designation;gestionnaire;immeuble_code;immeuble_ville;type_liste;nb_destinataires;a;cc;cci",
    "313;Conseil Syndical - S046;Adm;ACACIAS;LE MESNIL;2;2;;m1@example.test,m2@example.test;",
    "742;Liste travaux plancher;SK;;;0;1;ext@example.test;;",
    "",
  ].join("\n");

  it("ignore l'entete + les lignes vides, eclate les emails par virgule", () => {
    const lignes = parseListesDiffusion(CSV);
    expect(lignes).toHaveLength(2);
    expect(lignes[0].designation).toBe("Conseil Syndical - S046");
    expect(lignes[0].immeubleCode).toBe("ACACIAS");
    expect(lignes[0].cc).toEqual(["m1@example.test", "m2@example.test"]);
    expect(lignes[1].a).toEqual(["ext@example.test"]);
  });

  it("gere un BOM UTF-8 en tete de fichier", () => {
    const lignes = parseListesDiffusion("﻿" + CSV);
    expect(lignes).toHaveLength(2);
  });

  it("bout a bout : une ligne CS se rapproche de sa copro et donne ses destinataires", () => {
    const [cs] = parseListesDiffusion(CSV);
    expect(classifierListe(cs.designation)).toBe("conseil_syndical");
    expect(extraireRefCopro(cs.designation)).toBe("S46");
    expect(destinatairesListe(cs)).toEqual(["m1@example.test", "m2@example.test"]);
  });
});
