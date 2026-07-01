import { describe, expect, it } from "vitest";
import { normaliserPatrimoine, normaliserProprietaires } from "../normaliser";

describe("normaliserPatrimoine", () => {
  it("minuscule l'usage, prefixe les codes cles, coerce les nombres en chaine", () => {
    const r = normaliserPatrimoine({
      lots: [{ numero: "1", type: "Appartement", usage: "Residential", etage: "0", commentaire: "T2" }],
      cles: [{ code: "1", libelle: "Charges générales", totalAttendu: "1000" }],
      tantiemes: [{ cleCode: "1", lot: "1", valeur: "1000" }],
      notes: ["EDD retenu"],
    });
    expect(r.lots[0]!.usage).toBe("residential");
    expect(r.lots[0]!.etage).toBe(0);
    expect(r.cles[0]!.code).toBe("001");
    expect(r.tantiemes[0]!.cleCode).toBe("001");
    expect(r.tantiemes[0]!.valeur).toBe(1000);
    expect(r.notes).toContain("EDD retenu");
  });

  it("tolere les tableaux absents", () => {
    const r = normaliserPatrimoine({});
    expect(r.lots).toEqual([]);
    expect(r.cles).toEqual([]);
  });
});

describe("normaliserProprietaires", () => {
  it("applique MAJ au nom, Title Case au prenom, minuscule a la civilite, id par defaut", () => {
    const r = normaliserProprietaires({
      owners: [{ civilite: "M&Mme", nom: "dupont", prenom: "JEAN-pierre" }],
      attributions: [{ ownerId: "o1", lot: "3" }],
      notes: [],
    });
    expect(r.owners[0]!.nom).toBe("DUPONT");
    expect(r.owners[0]!.prenom).toBe("Jean-Pierre");
    expect(r.owners[0]!.civilite).toBe("m&mme");
    expect(r.owners[0]!.id).toBe("o1"); // id par defaut o<index>
    expect(r.attributions[0]!.lot).toBe(3);
  });

  it("respecte l'id fourni par le modele", () => {
    const r = normaliserProprietaires({
      owners: [{ id: "ABCD", civilite: "m", nom: "MARTIN" }],
      attributions: [],
      notes: [],
    });
    expect(r.owners[0]!.id).toBe("ABCD");
  });
});
