import { describe, expect, it } from "vitest";
import { chercherCopros, cleRecherche, coproCorrespond, nomCorrespond } from "./recherche-copro-tolerante";

const stMartin = { reference: "S0109", nom: "STMARTIN", adresse: "12 rue Saint-Martin 95870 Bezons" };
const rosiers = { reference: "S0178", nom: "LESROSIERS", adresse: "125 rue Louise Michel 78500 Sartrouville" };

describe("recherche de copropriété tolérante", () => {
  it("« St Martin », « saint-martin » et « STMARTIN » se valent", () => {
    for (const q of ["St Martin", "saint-martin", "STMARTIN", "st-martin"]) expect(coproCorrespond(stMartin, q)).toBe(true);
    expect(cleRecherche("Sainte-Anne")).toBe("stanne");
  });

  it("trouve par la ville et par le code, avec ou sans zéros", () => {
    expect(chercherCopros([rosiers, stMartin], "bezons").map((c) => c.reference)).toEqual(["S0109"]);
    expect(coproCorrespond(stMartin, "S109")).toBe(true);
    expect(coproCorrespond(stMartin, "109")).toBe(true);
    expect(coproCorrespond(rosiers, "S109")).toBe(false);
  });

  it("une recherche vide ne propose rien", () => {
    expect(chercherCopros([stMartin], "  ")).toEqual([]);
  });
});

describe("recherche d'une copropriété par un copropriétaire", () => {
  const martinAvecNoms = { ...stMartin, coproprietaires: ["Dupont Jean", "Le Goff-Ménard Anne", "SCI LES TILLEULS"] };
  const rosiersAvecNoms = { ...rosiers, coproprietaires: ["Dupont Marie", "Éloïse Martin"] };
  const pleiade = { reference: "S0297", nom: "La Pléiade", adresse: "4 allée des Astres 31000 Toulouse", coproprietaires: ["Montel Paul"] };

  it("le nom ou le prénom, sans accents ni majuscules, dans n'importe quel ordre", () => {
    expect(nomCorrespond("Dupont Jean", "dupont")).toBe(true);
    expect(nomCorrespond("Dupont Jean", "JEAN")).toBe(true);
    expect(nomCorrespond("Dupont Jean", "jean dup")).toBe(true);
    expect(nomCorrespond("Éloïse Martin", "eloise")).toBe(true);
    expect(nomCorrespond("Le Goff-Ménard Anne", "menard")).toBe(true);
    expect(nomCorrespond("Le Goff-Ménard Anne", "legoff")).toBe(true);
    expect(nomCorrespond("Le Goff-Ménard Anne", "le goff")).toBe(true);
  });

  it("pas de bout de mot pris au milieu, pas moins de 3 lettres", () => {
    expect(nomCorrespond("Dupont Jean", "ont")).toBe(false);
    expect(nomCorrespond("Dupont Jean", "du")).toBe(false);
    expect(nomCorrespond("Dupont Jean", "dupond")).toBe(false);
    expect(nomCorrespond("Dupont Jean", "dupont pierre")).toBe(false);
  });

  it("sort chaque copro où il a un lot, avec le nom trouvé", () => {
    const r = chercherCopros([pleiade, martinAvecNoms, rosiersAvecNoms], "Dupont");
    expect(r.map((c) => [c.reference, c.coproprietaireTrouve])).toEqual([
      ["S0109", "Dupont Jean"],
      ["S0178", "Dupont Marie"],
    ]);
  });

  it("une copro trouvée par son nom passe avant, sans copropriétaire affiché", () => {
    // « martin » : le nom de S0109, et une copropriétaire de S0178.
    const r = chercherCopros([rosiersAvecNoms, martinAvecNoms], "martin");
    expect(r.map((c) => [c.reference, c.coproprietaireTrouve])).toEqual([
      ["S0109", undefined],
      ["S0178", "Éloïse Martin"],
    ]);
  });

  it("le nombre de résultats reste borné", () => {
    const copros = Array.from({ length: 20 }, (_, i) => ({ reference: `S${100 + i}`, nom: `Copro ${i}`, adresse: "", coproprietaires: ["Dupont Jean"] }));
    expect(chercherCopros(copros, "dupont")).toHaveLength(8);
    expect(chercherCopros(copros, "dupont", 3)).toHaveLength(3);
  });

  it("une copro sans noms connus (Crypto) ne sort que par code, nom ou adresse", () => {
    expect(chercherCopros([stMartin], "dupont")).toEqual([]);
  });
});
