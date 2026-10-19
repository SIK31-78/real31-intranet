import { describe, expect, it } from "vitest";
import { adresses, codesParRnic, construireAnnuaire, mandatsAvecLotDepuisTexte, metiersParTiers } from "./annuaire-crypto.mjs";

const export1 = () => ({
  tiers: [
    { IdRef: "1", Identite: "DUPONT Jean", EMail: "Jean.Dupont@exemple.fr" },
    { IdRef: "2", Identite: "PLOMBERIE SA", EMail: "contact@plomberie.fr; devis@plomberie.fr" },
    { IdRef: "3", Identite: "MARTIN Lise", EMail: "" },
    { IdRef: "4", Identite: "DURAND Paul", EMail: "pas-une-adresse" },
  ],
  correspondants: [
    { IdrefTiers: "3", Nom: "MARTIN Lise (travail)", Email: "lise@bureau.fr", Inactif: "0" },
    { IdrefTiers: "2", Nom: "Ancien commercial", Email: "ancien@plomberie.fr", Inactif: "1" },
  ],
  mandats: [
    { IdRef: "M1", IDTiers: "1", IdSociete: "E1", ConseilSyndical: "Faux" },
    { IdRef: "M2", IDTiers: "1", IdSociete: "E2", ConseilSyndical: "Vrai" },
    { IdRef: "M3", IDTiers: "3", IdSociete: "E1", ConseilSyndical: "Faux" },
    { IdRef: "M4", IDTiers: "4", IdSociete: "E9", ConseilSyndical: "Faux" },
  ],
  mandatsAvecLot: new Set(["M1", "M2", "M3", "M4"]),
  immeubles: [
    { IdEntite: "E1", Registre_Numero: "aa 111" },
    { IdEntite: "E2", Registre_Numero: "BB222" },
  ],
  locataires: [],
  metiers: new Map([["2", "Entrep. Plomberie"]]),
  codeParRnic: codesParRnic([
    { registrationNumber: "AA111", referenceCrypto: "S101 " },
    { registrationNumber: "BB 222", referenceCrypto: "S202" },
  ]),
});

describe("construireAnnuaire", () => {
  it("relie une adresse a chacune des copros de la fiche, avec la qualite par copro", () => {
    const { lignes } = construireAnnuaire(export1());
    const jean = lignes.filter((l) => l.email === "jean.dupont@exemple.fr");
    expect(jean.map((l) => [l.copro_code, l.qualite])).toEqual([
      ["S101", "coproprietaire"],
      ["S202", "conseil_syndical"],
    ]);
  });

  it("garde un professionnel sans copro, avec son metier, une ligne par adresse", () => {
    const { lignes } = construireAnnuaire(export1());
    const pro = lignes.filter((l) => l.tiers_id === "2");
    expect(pro.map((l) => l.email)).toEqual(["contact@plomberie.fr", "devis@plomberie.fr"]);
    expect(pro[0]).toMatchObject({ qualite: "professionnel", metier: "Entrep. Plomberie", copro_code: null, source: "fiche" });
  });

  it("prend les correspondants actifs, qui heritent des copros de leur fiche", () => {
    const { lignes, bilan } = construireAnnuaire(export1());
    expect(lignes.find((l) => l.email === "lise@bureau.fr")).toMatchObject({ copro_code: "S101", source: "correspondant", nom: "MARTIN Lise (travail)" });
    expect(lignes.some((l) => l.email === "ancien@plomberie.fr")).toBe(false);
    expect(bilan.correspondantsInactifs).toBe(1);
  });

  it("ecarte les adresses invalides et compte les mandats dont la copro est inconnue", () => {
    const { lignes, bilan } = construireAnnuaire(export1());
    expect(lignes.some((l) => l.tiers_id === "4")).toBe(false);
    expect(bilan).toMatchObject({ mandatsSansCopro: 1, adresses: 4, adressesAvecCopro: 2 });
  });
});

describe("construireAnnuaire : mandats sans lot (REA-356)", () => {
  it("un mandat sans lot ne rattache pas la fiche a la copro : elle reste dans l'annuaire, sans copro", () => {
    const e = export1();
    e.mandatsAvecLot = new Set(["M2", "M4"]); // DUPONT n'a plus de lot sur S101, MARTIN plus aucun
    const { lignes } = construireAnnuaire(e);
    expect(lignes.filter((l) => l.tiers_id === "1").map((l) => [l.copro_code, l.qualite])).toEqual([["S202", "conseil_syndical"]]);
    expect(lignes.find((l) => l.email === "lise@bureau.fr")).toMatchObject({ copro_code: null, qualite: "autre" });
  });

  it("un membre du conseil syndical sans lot n'est plus marque conseil syndical", () => {
    const e = export1();
    e.mandatsAvecLot = new Set(["M1", "M3", "M4"]); // M2 = le mandat CS de DUPONT sur S202
    const { lignes } = construireAnnuaire(e);
    expect(lignes.some((l) => l.qualite === "conseil_syndical")).toBe(false);
    expect(lignes.filter((l) => l.tiers_id === "1").map((l) => l.copro_code)).toEqual(["S101"]);
  });

  it("compte les mandats sans lot dans le bilan, et exige l'ensemble", () => {
    const e = export1();
    e.mandatsAvecLot = new Set(["M1"]);
    expect(construireAnnuaire(e).bilan).toMatchObject({ mandatsSansLot: 2, mandatsSansCopro: 1 });
    expect(() => construireAnnuaire({ ...export1(), mandatsAvecLot: undefined })).toThrow(/mandatsAvecLot/);
  });

  it("extrait les IdPropSyndic du texte de Lot.txt, sans les lots sans proprietaire", () => {
    const texte = '[{"IdRef" : "82","IdPropSyndic" : "11484","IdPropTransac" : "0"},{"IdPropSyndic":"0"},{"IdPropSyndic" : ""},{"IdPropSyndic" : "77"}]';
    expect([...mandatsAvecLotDepuisTexte(texte)].sort()).toEqual(["11484", "77"]);
    const deja = new Set(["5"]);
    expect(mandatsAvecLotDepuisTexte('{"IdPropSyndic" : "6"}', deja)).toBe(deja);
    expect([...deja]).toEqual(["5", "6"]);
  });
});

describe("adresses / metiersParTiers", () => {
  it("decoupe un champ a plusieurs adresses et les met en minuscules", () => {
    expect(adresses(" A@x.fr ,b@y.com;; rien ")).toEqual(["a@x.fr", "b@y.com"]);
  });

  it("ne garde que les casquettes de metier", () => {
    const types = [
      { RefId: "6", NomK: "(S) Copropriétaire", CodeServiceConcerne: "2" },
      { RefId: "13", NomK: "Notaire", CodeServiceConcerne: "0" },
      { RefId: "99", NomK: "Voeux JG", CodeServiceConcerne: "0" },
      { RefId: "98", NomK: "3CX", CodeServiceConcerne: "0" },
    ];
    const casquettes = [
      { IdTiers: "1", RefIdTypeDeK: "99" },
      { IdTiers: "1", RefIdTypeDeK: "13" },
      { IdTiers: "2", RefIdTypeDeK: "6" },
      { IdTiers: "3", RefIdTypeDeK: "98" },
    ];
    expect([...metiersParTiers(casquettes, types)]).toEqual([["1", "Notaire"]]);
  });
});
