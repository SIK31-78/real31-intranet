import { describe, expect, it } from "vitest";
import { construireAnnuaire, normaliserNumero, versCsvLinkus, type ProprietaireAnnuaire } from "./linkus";

const proprio = (p: Partial<ProprietaireAnnuaire>): ProprietaireAnnuaire => ({
  lastname: "Dupont", firstname: "Jean", companyName: null, isPro: false, phone: null, mobile: null, contacts: [], ...p,
});

describe("normaliserNumero", () => {
  it("passe du format international au format national", () => {
    expect(normaliserNumero("+33 6 12 34 56 78")).toBe("0612345678");
    expect(normaliserNumero("0033147861911")).toBe("0147861911");
  });
  it("écarte le vide et le bouche-trou", () => {
    expect(normaliserNumero(null)).toBeNull();
    expect(normaliserNumero("+33600000000")).toBeNull();
    expect(normaliserNumero("12")).toBeNull();
  });
});

describe("construireAnnuaire", () => {
  it("range mobile et fixe, et nomme « NOM Prénom »", () => {
    const { lignes } = construireAnnuaire([
      { reference: "S0304", proprietaires: [proprio({ mobile: "+33612345678", phone: "+33147861911" })] },
    ]);
    expect(lignes).toEqual([{ nom: "DUPONT Jean", mobiles: ["0612345678"], fixes: ["0147861911"], locataire: false }]);
  });

  it("donne sa ligne à chaque contact, locataires signalés", () => {
    const { lignes, bilan } = construireAnnuaire([
      {
        reference: "S0304",
        proprietaires: [proprio({
          mobile: "+33612345678",
          contacts: [
            { lastname: "Martin", firstname: "Léa", company: null, phone: "+33699999999", tenant: true },
            { lastname: "Dupont", firstname: "Paul", company: null, phone: null, tenant: false },
          ],
        })],
      },
    ]);
    expect(lignes.map((l) => [l.nom, l.locataire])).toEqual([["DUPONT Jean", false], ["MARTIN Léa", true]]);
    expect(bilan.locataires).toBe(1);
  });

  it("ne sort un numéro qu'une fois et ignore la copro de test", () => {
    const { lignes, bilan } = construireAnnuaire([
      { reference: "S0297", proprietaires: [proprio({ mobile: "0612345678" })] },
      { reference: "S0305", proprietaires: [proprio({ lastname: "Durand", mobile: "+33612345678" })] },
      { reference: "SE999", proprietaires: [proprio({ lastname: "Test", mobile: "0700000001" })] },
    ]);
    expect(lignes.map((l) => l.nom)).toEqual(["DUPONT Jean"]);
    expect(bilan).toMatchObject({ copros: 2, numerosEnDouble: 1 });
  });

  it("compte les copropriétaires sans numéro et prend la raison sociale d'une société", () => {
    const { lignes, bilan } = construireAnnuaire([
      { reference: "S0297", proprietaires: [proprio({}), proprio({ isPro: true, companyName: "SCI Les Pins", mobile: "0611111111" })] },
    ]);
    expect(lignes[0]!.nom).toBe("SCI Les Pins");
    expect(bilan.proprietairesSansNumero).toBe(1);
  });
});

describe("versCsvLinkus", () => {
  it("suit le modèle Linkus : BOM, 25 colonnes, répertoire en dernier, guillemets si virgule", () => {
    const csv = versCsvLinkus([{ nom: "DURAND Anne, Paul", mobiles: ["0612345678"], fixes: [], locataire: true }]);
    expect(csv.startsWith("﻿First Name,Last Name,")).toBe(true);
    const ligne = csv.split("\r\n")[1]!;
    expect(ligne).toBe(',"DURAND Anne, Paul",,,,,,0612345678,,,,,,,,,,,Locataire,,,,,,real31_Phonebook');
  });
});
