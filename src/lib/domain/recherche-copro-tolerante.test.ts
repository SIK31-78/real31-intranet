import { describe, expect, it } from "vitest";
import {
  avecTrouveesParEmail,
  chercherCopros,
  cleRecherche,
  coproCorrespond,
  coprosParEmail,
  debutEmailRecherche,
  nomCorrespond,
} from "./recherche-copro-tolerante";

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

describe("recherche d'une copropriété par un locataire (03/11/2026)", () => {
  const martin = { ...stMartin, coproprietaires: ["Dupont Jean"], locataires: ["Durand Léa"] };

  it("trouve la copro du locataire, et dit qu'il est locataire", () => {
    const r = chercherCopros([rosiers, martin], "durand");
    expect(r.map((c) => [c.reference, c.coproprietaireTrouve, c.raisonTrouvee])).toEqual([["S0109", "Durand Léa", "Durand Léa · locataire"]]);
  });

  it("un copropriétaire trouvé l'est comme copropriétaire", () => {
    expect(chercherCopros([martin], "dupont")[0]?.raisonTrouvee).toBe("Dupont Jean · copropriétaire");
  });
});

describe("recherche d'une copropriété par l'adresse e-mail d'un client (03/11/2026)", () => {
  const expediteurs = {
    "jean.dupont@exemple.fr": [{ reference: "S0109", qualite: "copropriétaire" as const }],
    "jean.dupont@exemple.fr.autre": [{ reference: "S0109", qualite: "locataire" as const }],
    "jean.durand@exemple.fr": [{ reference: "S0178", qualite: "locataire" as const }],
    "contact@plomberie.fr": [
      { reference: "S0109", qualite: "fournisseur" as const },
      { reference: "S0178", qualite: "fournisseur" as const },
    ],
    "cs@exemple.fr": [
      { reference: "S0178", qualite: "conseil syndical" as const },
      { reference: "S0109", qualite: "notaire" as const },
    ],
  };

  it("ne cherche par l'adresse que si la recherche y ressemble, 5 caractères au moins", () => {
    expect(debutEmailRecherche(" Jean.Dupont@Exe ")).toBe("jean.dupont@exe");
    expect(debutEmailRecherche("jean.dupont")).toBe("jean.dupont");
    expect(debutEmailRecherche("du@x")).toBeNull();
    expect(debutEmailRecherche("dupont")).toBeNull();
    expect(debutEmailRecherche("jean dupont@x.fr")).toBeNull();
    expect(debutEmailRecherche("S0109")).toBeNull();
  });

  it("le début de l'adresse suffit ; une copro n'apparaît qu'une fois", () => {
    expect(coprosParEmail(expediteurs, "jean.d")).toEqual([
      { reference: "S0109", email: "jean.dupont@exemple.fr", qualite: "copropriétaire" },
      { reference: "S0178", email: "jean.durand@exemple.fr", qualite: "locataire" },
    ]);
  });

  it("l'adresse exacte passe d'abord", () => {
    expect(coprosParEmail(expediteurs, "jean.dupont@exemple.fr.autre")).toEqual([
      { reference: "S0109", email: "jean.dupont@exemple.fr.autre", qualite: "locataire" },
    ]);
    const r = coprosParEmail({ "ab@x.frz": [{ reference: "S1", qualite: "copropriétaire" }], "ab@x.fr": [{ reference: "S2", qualite: "copropriétaire" }] }, "ab@x.fr");
    expect(r.map((t) => t.reference)).toEqual(["S2", "S1"]);
  });

  it("jamais par un fournisseur, un notaire ou un mandataire", () => {
    expect(coprosParEmail(expediteurs, "contact@plomberie.fr")).toEqual([]);
    expect(coprosParEmail(expediteurs, "cs@exemple.fr")).toEqual([{ reference: "S0178", email: "cs@exemple.fr", qualite: "conseil syndical" }]);
  });

  it("borné, et rien pour une recherche qui n'est pas une adresse", () => {
    const beaucoup = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`client${i}@x.fr`, [{ reference: `S${100 + i}`, qualite: "copropriétaire" as const }]]));
    expect(coprosParEmail(beaucoup, "client")).toEqual([]);
    expect(coprosParEmail(beaucoup, "client1")).toEqual([]);
    expect(coprosParEmail(beaucoup, "client@")).toEqual([]);
    expect(coprosParEmail(beaucoup, "client1@")).toHaveLength(1);
    expect(coprosParEmail(beaucoup, "clien")).toEqual([]);
    expect(coprosParEmail({ ...beaucoup, ...Object.fromEntries(Object.entries(beaucoup).map(([e, l]) => [`a.${e}`, l])) }, "a.cli")).toHaveLength(8);
  });

  it("les copros de l'adresse passent d'abord, avec la raison, sans doublon", () => {
    const parEmail = coprosParEmail(expediteurs, "jean.d");
    const trouvees = chercherCopros([rosiers, stMartin], "rosiers");
    const r = avecTrouveesParEmail(trouvees, [rosiers, stMartin], parEmail);
    expect(r.map((c) => [c.reference, c.raisonTrouvee])).toEqual([
      ["S0109", "jean.dupont@exemple.fr · copropriétaire"],
      ["S0178", "jean.durand@exemple.fr · locataire"],
    ]);
  });

  it("une référence inconnue de la liste est ignorée ; sans adresse, la liste reste telle quelle", () => {
    const trouvees = chercherCopros([rosiers], "rosiers");
    expect(avecTrouveesParEmail(trouvees, [rosiers], [{ reference: "S0999", email: "x@y.fr", qualite: "copropriétaire" }])).toEqual(trouvees);
    expect(avecTrouveesParEmail(trouvees, [rosiers], [])).toBe(trouvees);
  });
});
