// Tests du bloc TRAVAUX de l'ODJ (modele Word du CS, retour collegues 2026-09-04) :
// intitule / budget vote / depenses constatees / ecart / nota / cloture pour repartition.
//
// Deux regles portent tout le bloc :
//  - l'ecart CHANGE DE NOM selon son signe ("Trop-perçu" / "Dépassement"), comme le fait
//    deja l'ecart du budget courant -- ecrire "Dépassement : -3 000 €" serait un contresens ;
//  - Estale peut remonter PLUSIEURS chantiers alors que le document n'a qu'un bloc : on
//    somme, sinon l'ecart affiche ne correspondrait a aucun des deux montants.

import { describe, expect, it } from "vitest";
import { ecartBudget, ecartMontants, travauxAuto } from "./odj";

/** Les montants sont formates en euros fr-FR (espaces insecables) : on compare le SENS. */
const nombre = (v: string) => Number(v.replace(/[^\d,-]/g, "").replace(",", "."));

describe("ecartMontants", () => {
  it("dit 'Trop-perçu' quand les depenses sont sous le budget", () => {
    const e = ecartMontants("45000", "39000");
    expect(e?.libelle).toBe("Trop-perçu");
    expect(nombre(e?.valeur ?? "")).toBe(6000);
  });

  it("dit 'Dépassement' et rend le montant POSITIF quand on a depense plus", () => {
    const e = ecartMontants("45000", "52500");
    expect(e?.libelle).toBe("Dépassement");
    expect(nombre(e?.valeur ?? "")).toBe(7500);
  });

  it("compte l'equilibre parfait comme un trop-percu de zero, jamais un depassement", () => {
    expect(ecartMontants("45000", "45000")?.libelle).toBe("Trop-perçu");
  });

  it("ne calcule rien tant qu'un des deux montants manque (pas de faux ecart)", () => {
    expect(ecartMontants(undefined, "39000")).toBeUndefined();
    expect(ecartMontants("45000", undefined)).toBeUndefined();
    expect(ecartMontants("", "")).toBeUndefined();
    expect(ecartMontants("quarante-cinq mille", "39000")).toBeUndefined();
  });

  it("lit un montant tape a la main (espaces, virgule, symbole)", () => {
    expect(nombre(ecartMontants("45 000,50 €", "40 000")?.valeur ?? "")).toBe(5000.5);
  });

  it("suffixe le libelle quand la ligne le demande (budget courant)", () => {
    expect(ecartBudget("45000", "39000")?.libelle).toBe("Trop-perçu budget courant");
    expect(ecartBudget("39000", "45000")?.libelle).toBe("Dépassement budget courant");
  });
});

describe("travauxAuto (pre-remplissage Estale)", () => {
  it("reprend tel quel le chantier unique", () => {
    expect(travauxAuto([{ libelle: "Ravalement façade", budgetVote: 45000, depenses: 39000 }])).toEqual({
      intitule: "Ravalement façade",
      budgetVote: "45000",
      depenses: "39000",
    });
  });

  it("joint les intitules et SOMME les montants quand plusieurs chantiers sont ouverts", () => {
    const t = travauxAuto([
      { libelle: "Ravalement façade", budgetVote: 45000, depenses: 39000 },
      { libelle: "Réfection toiture", budgetVote: 12000, depenses: 12500 },
    ]);
    expect(t?.intitule).toBe("Ravalement façade ; Réfection toiture");
    expect(t?.budgetVote).toBe("57000");
    expect(t?.depenses).toBe("51500");
    // Le total reste coherent avec l'ecart affiche sous les deux lignes.
    expect(nombre(ecartMontants(t?.budgetVote, t?.depenses)?.valeur ?? "")).toBe(5500);
  });

  it("laisse le bloc entierement a saisir quand Estale n'a aucun chantier", () => {
    expect(travauxAuto([])).toBeUndefined();
    expect(travauxAuto(undefined)).toBeUndefined();
  });
});
