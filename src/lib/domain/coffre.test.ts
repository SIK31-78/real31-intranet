import { describe, expect, it } from "vitest";
import {
  evaluerForceMotDePasse,
  validerNouveauMotDePasseMaitre,
  impactReinitialisation,
  estRenseigne,
  secretCorrespond,
  type Coffre,
  type SecretClair,
  type ScopeCoffre,
} from "./coffre";

describe("evaluerForceMotDePasse (mot de passe maitre)", () => {
  it("refuse les mots de passe trop courts", () => {
    const r = evaluerForceMotDePasse("Ab1!xyz"); // 7 caracteres
    expect(r.ok).toBe(false);
    expect(r.niveau).toBe("faible");
  });

  it("refuse '12345678' (le cas teste par Sekou)", () => {
    expect(evaluerForceMotDePasse("12345678").ok).toBe(false);
  });

  it("refuse une suite de chiffres meme longue (peu de variete)", () => {
    expect(evaluerForceMotDePasse("123456789012").ok).toBe(false); // 12 chiffres
  });

  it("refuse un mot de passe courant", () => {
    expect(evaluerForceMotDePasse("motdepasse").ok).toBe(false);
  });

  it("refuse un seul caractere repete", () => {
    expect(evaluerForceMotDePasse("aaaaaaaaaaaa").ok).toBe(false);
  });

  it("accepte un mot de passe varie de 12+ caracteres", () => {
    const r = evaluerForceMotDePasse("Real31!Syndic26");
    expect(r.ok).toBe(true);
    expect(r.niveau).toBe("fort");
  });

  it("accepte une passphrase longue meme peu variee", () => {
    expect(evaluerForceMotDePasse("cheval correct pile agrafe").ok).toBe(true);
  });
});

describe("validerNouveauMotDePasseMaitre (changement / reinitialisation)", () => {
  it("refuse un nouveau mot de passe faible", () => {
    const r = validerNouveauMotDePasseMaitre("12345678", "12345678");
    expect(r.ok).toBe(false);
  });

  it("refuse une confirmation qui ne correspond pas", () => {
    const r = validerNouveauMotDePasseMaitre("Real31!Syndic26", "Real31!Syndic27");
    expect(r.ok).toBe(false);
    expect(r.raison).toMatch(/correspondent/);
  });

  it("refuse de 'changer' pour le meme mot de passe", () => {
    const r = validerNouveauMotDePasseMaitre("Real31!Syndic26", "Real31!Syndic26", "Real31!Syndic26");
    expect(r.ok).toBe(false);
    expect(r.raison).toMatch(/différent/);
  });

  it("accepte un nouveau mot de passe fort et different", () => {
    expect(validerNouveauMotDePasseMaitre("Real31!Syndic26", "Real31!Syndic26", "Ancien!Mdp2025").ok).toBe(true);
  });

  it("sans ancien connu (reinitialisation), n'exige que force + confirmation", () => {
    expect(validerNouveauMotDePasseMaitre("Real31!Syndic26", "Real31!Syndic26").ok).toBe(true);
  });

  it("ignore un ancien vide (cas passkey) plutot que de bloquer", () => {
    expect(validerNouveauMotDePasseMaitre("Real31!Syndic26", "Real31!Syndic26", "").ok).toBe(true);
  });
});

describe("impactReinitialisation (ce qu'on annonce AVANT de detruire)", () => {
  const coffre = (id: string, nom: string, scope: ScopeCoffre): Coffre => ({
    id,
    nom,
    scope,
    sensibilite: "standard",
  });

  it("classe les persos en perte definitive et les partages en acces a redonner", () => {
    const r = impactReinitialisation([
      coffre("c1", "Mes mots de passe", "personal"),
      coffre("c2", "Reseau", "network"),
      coffre("c3", "Syndic", "service"),
    ]);
    expect(r.perdus.map((c) => c.nom)).toEqual(["Mes mots de passe"]);
    expect(r.aReoctroyer.map((c) => c.nom)).toEqual(["Reseau", "Syndic"]);
    expect(r.perteDefinitive).toBe(true);
  });

  it("sans coffre perso, il n'y a pas de perte definitive a annoncer", () => {
    const r = impactReinitialisation([coffre("c2", "Reseau", "network")]);
    expect(r.perteDefinitive).toBe(false);
    expect(r.perdus).toEqual([]);
  });

  it("aucun coffre : rien a perdre", () => {
    expect(impactReinitialisation([])).toEqual({ perdus: [], aReoctroyer: [], perteDefinitive: false });
  });
});

describe("estRenseigne (valeur utile ou placeholder)", () => {
  it("accepte un texte, refuse le vide et les tirets seuls", () => {
    expect(estRenseigne("S0297")).toBe(true);
    expect(estRenseigne("")).toBe(false);
    expect(estRenseigne(undefined)).toBe(false);
    expect(estRenseigne("-")).toBe(false);
    expect(estRenseigne(" -- ")).toBe(false);
  });
});

describe("secretCorrespond (recherche multi-termes)", () => {
  const s: SecretClair = {
    titre: "EDF",
    copropriete: "S0297 La Pleiade",
    immeuble: "Bat A",
    url: "https://espace.edf.fr",
    login: "syndic@real31.fr",
    motDePasse: "secret",
    notes: "compteur chaufferie",
  };
  it("tous les termes doivent apparaitre, dans n'importe quel champ, sans tenir compte de la casse", () => {
    expect(secretCorrespond(s, "edf pleiade")).toBe(true);
    expect(secretCorrespond(s, "CHAUFFERIE syndic")).toBe(true);
    expect(secretCorrespond(s, "edf engie")).toBe(false);
  });
  it("une recherche vide correspond a tout, le mot de passe n'est jamais fouille", () => {
    expect(secretCorrespond(s, "")).toBe(true);
    expect(secretCorrespond(s, "   ")).toBe(true);
    expect(secretCorrespond(s, "secret")).toBe(false);
  });
});
