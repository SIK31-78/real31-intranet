import { describe, expect, it } from "vitest";
import { alertesAdressePersonnelle, classerDestinataires, collegueDuNom, estAdresseReal31, motsDuNom } from "./destinataires-collegues";
import type { DestinataireTrouve } from "./mes-emails-composition";

const collegues = [
  { nom: "Elsa PEIXOTO", email: "elsa.peixoto@real31.fr" },
  { nom: "Mathilde Durand", email: "mathilde.durand@real31.fr" },
  { nom: "Cher", email: "cher@real31.fr" },
];

const fiche = (nom: string, emails: string[], extra: Partial<DestinataireTrouve> = {}): DestinataireTrouve => ({
  cle: `crypto:${nom}`,
  nom,
  casquette: "copropriétaire",
  emails,
  copros: [],
  ...extra,
});

describe("motsDuNom / collegueDuNom", () => {
  it("retire accents, casse et civilités", () => {
    expect(motsDuNom("M. et Mme PÉIXOTO Elsa")).toEqual(["peixoto", "elsa"]);
  });
  it("reconnaît un collègue quel que soit l'ordre prénom / nom", () => {
    expect(collegueDuNom("PEIXOTO Elsa", collegues)?.email).toBe("elsa.peixoto@real31.fr");
    expect(collegueDuNom("Mme Elsa Peixoto", collegues)?.email).toBe("elsa.peixoto@real31.fr");
  });
  it("ne reconnaît pas un homonyme partiel ni un nom d'un seul mot", () => {
    expect(collegueDuNom("PEIXOTO Jean", collegues)).toBeNull();
    expect(collegueDuNom("Cher", collegues)).toBeNull();
  });
  it("estAdresseReal31", () => {
    expect(estAdresseReal31(" Elsa.Peixoto@REAL31.fr ")).toBe(true);
    expect(estAdresseReal31("elsa@gmail.com")).toBe(false);
  });
});

describe("classerDestinataires (incident Elsa)", () => {
  it("met le collègue en premier avec le badge, et marque la fiche cliente du même nom", () => {
    const l = classerDestinataires([fiche("PEIXOTO Elsa", ["elsa.p@gmail.com"]), fiche("ELSAESSER Paul", ["paul@x.fr"])], collegues, "elsa");
    expect(l.map((d) => [d.nom, d.genre ?? null])).toEqual([
      ["Elsa PEIXOTO", "collegue"],
      ["PEIXOTO Elsa", "client"],
      ["ELSAESSER Paul", null],
    ]);
    expect(l[0]!.emails).toEqual(["elsa.peixoto@real31.fr"]);
  });
  it("trouve un collègue par le début du nom ou de l'adresse, sans accent", () => {
    expect(classerDestinataires([], collegues, "peix")[0]?.nom).toBe("Elsa PEIXOTO");
    expect(classerDestinataires([], collegues, "mathilde dur")[0]?.nom).toBe("Mathilde Durand");
    expect(classerDestinataires([], collegues, "S247")).toEqual([]);
  });
  it("retire la fiche d'annuaire qui ne porte que l'adresse REAL31 du collègue proposé", () => {
    const l = classerDestinataires([fiche("Elsa Peixoto", ["Elsa.Peixoto@real31.fr"])], collegues, "elsa");
    expect(l).toHaveLength(1);
    expect(l[0]!.genre).toBe("collegue");
  });
  it("ne marque pas « Client » une fiche dont l'adresse est REAL31", () => {
    const l = classerDestinataires([fiche("Elsa Peixoto", ["elsa.peixoto@real31.fr", "accueil@real31.fr"])], collegues, "xyz");
    expect(l[0]!.genre).toBeUndefined();
  });
  it("plafonne la liste", () => {
    const beaucoup = Array.from({ length: 20 }, (_, i) => fiche(`Elsa ${i}`, [`e${i}@x.fr`]));
    expect(classerDestinataires(beaucoup, collegues, "elsa", 15)).toHaveLength(15);
  });
});

describe("alertesAdressePersonnelle", () => {
  it("avertit pour l'adresse perso d'un collègue (par le nom)", () => {
    expect(alertesAdressePersonnelle([{ nom: "PEIXOTO Elsa", emails: ["elsa.p@gmail.com"] }], collegues)).toEqual([
      "Elsa PEIXOTO : adresse personnelle (elsa.p@gmail.com), pas son adresse REAL31 (elsa.peixoto@real31.fr).",
    ]);
  });
  it("avertit aussi pour une adresse tapée sans nom qui porte prénom et nom", () => {
    expect(alertesAdressePersonnelle([{ nom: "", emails: ["Elsa.Peixoto@gmail.com"] }], collegues)).toHaveLength(1);
  });
  it("se tait pour l'adresse REAL31 et pour un inconnu", () => {
    expect(
      alertesAdressePersonnelle(
        [
          { nom: "Elsa PEIXOTO", emails: ["elsa.peixoto@real31.fr"] },
          { nom: "Paul Martin", emails: ["paul@x.fr"] },
        ],
        collegues,
      ),
    ).toEqual([]);
  });
  it("une seule phrase par collègue", () => {
    expect(alertesAdressePersonnelle([{ nom: "Elsa PEIXOTO", emails: ["a@x.fr", "b@y.fr"] }], collegues)).toHaveLength(1);
  });
});
