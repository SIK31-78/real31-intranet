import { describe, expect, it } from "vitest";
import {
  classeDe,
  construireBalance,
  type SoldeCompte,
  type ClasseComptable,
} from "../compta";

/** Fabrique un SoldeCompte (classe derivee de la nomenclature, solde = debit - credit). */
function compte(nomenclature: string, debit: number, credit: number): SoldeCompte {
  return {
    nomenclature,
    classe: classeDe(nomenclature),
    debit,
    credit,
    solde: debit - credit,
  };
}

describe("classeDe", () => {
  it("deduit la classe du 1er chiffre de la nomenclature", () => {
    expect(classeDe("4010000")).toBe(4);
    expect(classeDe("5120001")).toBe(5);
    expect(classeDe("6")).toBe(6);
    expect(classeDe("701T02")).toBe(7);
    expect(classeDe("1030000")).toBe(1);
  });

  it("leve pour une nomenclature hors 1..7 (0/8/9, vide, non numerique)", () => {
    expect(() => classeDe("8010000")).toThrow();
    expect(() => classeDe("0010000")).toThrow();
    expect(() => classeDe("9000000")).toThrow();
    expect(() => classeDe("")).toThrow();
    expect(() => classeDe("ABC")).toThrow();
  });
});

describe("construireBalance - agregation par classe", () => {
  it("regroupe debit/credit/solde par classe (7 clefs toujours presentes)", () => {
    const b = construireBalance([
      compte("4010000", 0, 5000),
      compte("4500001", 3000, 0),
      compte("5120000", 8000, 0),
      compte("6060000", 4000, 0),
      compte("7010000", 0, 10000),
    ]);

    // Les 7 classes existent, celles sans compte sont a 0.
    for (const c of [1, 2, 3, 4, 5, 6, 7] as ClasseComptable[]) {
      expect(b.parClasse[c]).toBeDefined();
    }
    expect(b.parClasse[1]).toEqual({ debit: 0, credit: 0, solde: 0 });
    expect(b.parClasse[2]).toEqual({ debit: 0, credit: 0, solde: 0 });

    // Classe 4 = 401 (credit 5000) + 450 (debit 3000).
    expect(b.parClasse[4]).toEqual({ debit: 3000, credit: 5000, solde: -2000 });
    // Classe 5 = banque (debit 8000).
    expect(b.parClasse[5]).toEqual({ debit: 8000, credit: 0, solde: 8000 });
    // Classe 6 = charges (debit 4000).
    expect(b.parClasse[6]).toEqual({ debit: 4000, credit: 0, solde: 4000 });
    // Classe 7 = produits (credit 10000).
    expect(b.parClasse[7]).toEqual({ debit: 0, credit: 10000, solde: -10000 });
  });
});

describe("construireBalance - equilibre", () => {
  it("equilibre=true quand total debit == total credit (balance tombe a 0)", () => {
    const b = construireBalance([
      compte("4010000", 0, 5000),
      compte("4500001", 3000, 0),
      compte("5120000", 8000, 0),
      compte("6060000", 4000, 0),
      compte("7010000", 0, 10000),
    ]);
    expect(b.totalDebit).toBe(15000);
    expect(b.totalCredit).toBe(15000);
    expect(b.ecart).toBe(0);
    expect(b.equilibre).toBe(true);
  });

  it("equilibre=false et ecart signe quand la classe 7 (produits) manque", () => {
    // Memes comptes SANS le 701 : blocs A (4/5) + B (6) seuls ne tombent pas a 0.
    const b = construireBalance([
      compte("4010000", 0, 5000),
      compte("4500001", 3000, 0),
      compte("5120000", 8000, 0),
      compte("6060000", 4000, 0),
    ]);
    expect(b.totalDebit).toBe(15000);
    expect(b.totalCredit).toBe(5000);
    expect(b.ecart).toBe(10000);
    expect(b.equilibre).toBe(false);
  });
});

describe("construireBalance - arrondi et tolerance", () => {
  it("tolere un bruit d'arrondi sous le seuil (0.001) comme equilibre", () => {
    const b = construireBalance([compte("6060000", 100.001, 0), compte("7010000", 0, 100)]);
    // 100.001 arrondi au centime -> 100.00 des deux cotes.
    expect(b.ecart).toBe(0);
    expect(b.equilibre).toBe(true);
  });

  it("agrege sans bruit flottant (0.1 + 0.2 == 0.3)", () => {
    const b = construireBalance([
      compte("6060000", 0.1, 0),
      compte("6060001", 0.2, 0),
      compte("7010000", 0, 0.3),
    ]);
    expect(b.parClasse[6].debit).toBe(0.3);
    expect(b.ecart).toBe(0);
    expect(b.equilibre).toBe(true);
  });

  it("detecte un desequilibre juste au-dessus du seuil (0.01)", () => {
    const b = construireBalance([compte("6060000", 100.01, 0), compte("7010000", 0, 100)]);
    expect(b.ecart).toBe(0.01);
    expect(b.equilibre).toBe(false);
  });
});
