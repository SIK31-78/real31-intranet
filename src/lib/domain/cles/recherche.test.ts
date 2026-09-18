import { describe, expect, it } from "vitest";
import { filtrerIndex, type EntreeIndex } from "./recherche";
import { normaliserNomEntreprise, normaliserTexte, numeroCanonique } from "./normaliser";
import { texteMouvement } from "./journal";

const INDEX: EntreeIndex[] = [
  { kind: "trousseau", id: "t1", numero: "R004", libelle: "Accès total", etat: "sorti", biens: "S008 · NORDMANN10 · 10 rue L.M. Nordmann · S009 · NATIONAL30 · 30 bd National", detenteur: "CTH", emplacement: "T004" },
  { kind: "trousseau", id: "t2", numero: "R040", libelle: "Accès total", etat: "en_agence", biens: "S107 · FOCH37 · 37 avenue Foch" },
  { kind: "trousseau", id: "t3", numero: "J045", libelle: "Local fibre", etat: "en_agence", biens: "S118 · RÉSIDENCE ÉLYSÉE · 2 rue Médéric" },
  { kind: "copro", code: "S008", nom: "NORDMANN10", adresse: "10 rue L.M. Nordmann, La Garenne-Colombes", trousseaux: 2 },
  { kind: "entreprise", id: "e1", nom: "ÉCO SÉCURITÉ INCENDIE", detenus: 1, enRetard: 0, bloquee: false },
];

describe("normaliser", () => {
  it("retire accents, casse et ponctuation", () => {
    expect(normaliserTexte("ÉCO Sécurité-Incendie  ")).toBe("eco securite incendie");
    expect(normaliserNomEntreprise("L'Esprit Vert")).toBe("l esprit vert");
  });
  it("canonise un numero de trousseau", () => {
    expect(numeroCanonique("r4")).toBe("R004");
    expect(numeroCanonique(" j045 ")).toBe("J045");
    expect(numeroCanonique("R004")).toBe("R004");
    expect(numeroCanonique("PASS GENERAL")).toBe("PASS GENERAL");
  });
});

describe("filtrerIndex", () => {
  it("vide sans requete", () => {
    expect(filtrerIndex(INDEX, "  ")).toEqual([]);
  });
  it("trouve par numero court, exact en tete", () => {
    const r = filtrerIndex(INDEX, "r4");
    expect(r[0]).toMatchObject({ kind: "trousseau", numero: "R004" });
    // « r4 » ne matche pas R040 par sous-chaine (le numero canonique est R004).
    expect(r.some((e) => e.kind === "trousseau" && e.numero === "R040")).toBe(false);
  });
  it("tolere les accents et cherche dans les biens", () => {
    expect(filtrerIndex(INDEX, "nordman").map((e) => e.kind)).toEqual(["trousseau", "copro"]);
    expect(filtrerIndex(INDEX, "mederic")[0]).toMatchObject({ numero: "J045" });
    expect(filtrerIndex(INDEX, "eco securite")[0]).toMatchObject({ kind: "entreprise" });
  });
  it("tous les termes doivent matcher", () => {
    expect(filtrerIndex(INDEX, "nordmann fibre")).toEqual([]);
    expect(filtrerIndex(INDEX, "cth")).toHaveLength(1);
  });
});

describe("texteMouvement", () => {
  const base = { id: "m", trousseauId: "t", horodatageISO: "2026-09-18T10:00:00Z", parNom: "Neis", agenceCode: "LGC" };
  it("dit qui, quoi, quand", () => {
    expect(texteMouvement({ ...base, type: "sortie", entrepriseNom: "CTH", details: { retourPrevuLeISO: "2026-09-19", contactNom: "M. Martin", motif: "fuite" } })).toBe("Remis à CTH (M. Martin), retour prévu le 19/09/2026 — fuite");
    expect(texteMouvement({ ...base, type: "sortie", details: { type: "interne", retourPrevuLeISO: "2026-09-18", contactNom: "Julie B." } })).toBe("Sorti en interne par Julie B., retour prévu le 18/09/2026");
    expect(texteMouvement({ ...base, type: "retour", entrepriseNom: "CTH", details: { conformite: "incomplet", joursDehors: 3, commentaire: "manque le bip" } })).toBe("Rendu par CTH — incomplet (3 j dehors) — manque le bip");
    expect(texteMouvement({ ...base, type: "reservation", entrepriseNom: "ABSOLU", details: { debutISO: "2026-09-20", finPrevueISO: "2026-09-20" } })).toBe("Réservé pour ABSOLU du 20/09/2026 au 20/09/2026");
    expect(texteMouvement({ ...base, type: "import", details: { libelle: "Emprunté", incoherence: "restitué sans emprunt" } })).toMatch(/incohérence : restitué sans emprunt/);
  });
});
