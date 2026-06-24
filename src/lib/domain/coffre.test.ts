import { describe, expect, it } from "vitest";
import { evaluerForceMotDePasse } from "./coffre";

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
