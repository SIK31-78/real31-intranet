// Tests du parseur CSV d'import (ADR-025), cales sur le vrai modele REAL31
// (colonnes Entite, Immeuble, Entreprise, Identifiant, Mot de passe, Autre info).
import { describe, it, expect } from "vitest";
import { parserCsv, detecterColonnes, versSecret, cleDedup, detecterDelimiteur, decoderTexte } from "./import-csv";

const ENTETES = ["Entite", "Immeuble", "Entreprise", "Identifiant", "Mot de passe", "Autre info"];

describe("parserCsv", () => {
  it("detecte le point-virgule (Excel FR) et lit entetes + lignes", () => {
    const csv = "Entite;Immeuble;Entreprise;Identifiant;Mot de passe;Autre info\n- ;Toutes;EDF;denis@real31.fr;secret1;https://edf.fr";
    const { entetes, lignes } = parserCsv(csv);
    expect(entetes).toEqual(ENTETES);
    expect(lignes).toHaveLength(1);
    expect(lignes[0][2]).toBe("EDF");
    expect(lignes[0][3]).toBe("denis@real31.fr");
  });

  it("gere les guillemets, le delimiteur dans un champ et les guillemets echappes", () => {
    const csv = 'a,b\n"x, y","il dit ""ok"""';
    const { lignes } = parserCsv(csv);
    expect(lignes[0]).toEqual(["x, y", 'il dit "ok"']);
  });

  it("ignore les lignes vides et gere le CRLF + BOM", () => {
    const csv = "﻿a,b\r\n1,2\r\n\r\n3,4\r\n";
    const { entetes, lignes } = parserCsv(csv);
    expect(entetes).toEqual(["a", "b"]);
    expect(lignes).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("detecterDelimiteur prefere ; quand il domine", () => {
    expect(detecterDelimiteur("a;b;c")).toBe(";");
    expect(detecterDelimiteur("a,b,c")).toBe(",");
  });
});

describe("decoderTexte (encodage)", () => {
  it("decode l'UTF-8", () => {
    const buf = new TextEncoder().encode("Deroule").buffer;
    expect(decoderTexte(buf)).toBe("Deroule");
  });

  it("decode l'UTF-8 accentue", () => {
    const buf = new TextEncoder().encode("Déroulé").buffer;
    expect(decoderTexte(buf)).toBe("Déroulé");
  });

  it("retombe sur Windows-1252 quand ce n'est pas de l'UTF-8 valide", () => {
    // "Déroulé" en Windows-1252 : e accent aigu = 0xE9 (invalide en UTF-8 isole).
    const bytes = new Uint8Array([0x44, 0xe9, 0x72, 0x6f, 0x75, 0x6c, 0xe9]);
    expect(decoderTexte(bytes.buffer)).toBe("Déroulé");
  });
});

describe("detecterColonnes (modele REAL31)", () => {
  it("mappe Entite->copropriete, Immeuble->immeuble, Entreprise->titre, Identifiant->login, Mot de passe, Autre info->notes", () => {
    const m = detecterColonnes(ENTETES);
    expect(m).toEqual({ titre: 2, copropriete: 0, immeuble: 1, login: 3, motDePasse: 4, url: null, notes: 5 });
  });
});

describe("versSecret", () => {
  const map = detecterColonnes(ENTETES);

  it("transforme une ligne en secret (avec copropriete + immeuble)", () => {
    const s = versSecret(["Toutes coproprietes", "40 JBONAL", "EDF", "denis@real31.fr", "secret1", "SIRET 123"], map);
    expect(s).toEqual({
      titre: "EDF",
      copropriete: "Toutes coproprietes",
      immeuble: "40 JBONAL",
      login: "denis@real31.fr",
      motDePasse: "secret1",
      notes: "SIRET 123",
    });
  });

  it("ignore une ligne sans mot de passe", () => {
    expect(versSecret(["- ", "Toutes", "EDF", "denis@real31.fr", "", "SIRET 123"], map)).toBeNull();
  });

  it("retombe sur le login comme titre si pas d'entreprise", () => {
    const s = versSecret(["", "", "", "login@x.fr", "p", ""], map);
    expect(s?.titre).toBe("login@x.fr");
  });

  it("traite les placeholders '-' comme vides", () => {
    // Entite='-', Immeuble='-', Entreprise='-' -> titre retombe sur le login.
    const s = versSecret(["-", "- ", "-", "user@x.fr", "p", "--"], map);
    expect(s).toEqual({ titre: "user@x.fr", motDePasse: "p", login: "user@x.fr" });
  });
});

describe("cleDedup", () => {
  it("est insensible a la casse sur url + login", () => {
    expect(cleDedup({ titre: "A", motDePasse: "p", url: "Site.FR", login: "Bob" })).toBe(
      cleDedup({ titre: "B", motDePasse: "q", url: "site.fr", login: "bob" }),
    );
  });
});
