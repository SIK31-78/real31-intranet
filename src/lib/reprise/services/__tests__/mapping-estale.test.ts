// Tests DEDIES du mapping domaine reprise -> inputs eStale (mapping-estale.ts).
// Risque n1 du repo : ce fichier alimente l'ECRITURE REELLE en production eStale et
// n'avait aucun test direct avant ce fichier (seule couverture : injecter-patrimoine.test.ts,
// via l'orchestration complete). On teste ici chaque fonction pure isolement, avec ses
// avertissements de mapping, pour verrouiller les replis et troncatures documentes en tete
// de mapping-estale.ts.

import { describe, expect, it } from "vitest";
import type { Owner, Lot, Cle, Attribution, Usage, Civilite } from "@/lib/reprise/domain/patrimoine";
import type { AddressInputEstale, LotCategoryEstale, CivilityEstale } from "@/lib/reprise/ports/estale-ecriture-provider";
import {
  mapUsage,
  mapCivilite,
  mapLot,
  mapCle,
  mapOwner,
  adresseCorrespondCopro,
  construireLiensLot,
  type AvertissementMapping,
} from "../mapping-estale";

function owner(overrides: Partial<Owner> = {}): Owner {
  return {
    id: "o1",
    civilite: "m",
    nom: "DUPONT",
    pro: false,
    ...overrides,
  };
}

function lot(overrides: Partial<Lot> = {}): Lot {
  return {
    numero: 1,
    type: "Appartement",
    usage: "residential",
    commentaire: "",
    ...overrides,
  };
}

function cle(overrides: Partial<Cle> = {}): Cle {
  return {
    code: "001",
    libelle: "Charges",
    totalAttendu: 100,
    ...overrides,
  };
}

function adresse(overrides: Partial<AddressInputEstale> = {}): AddressInputEstale {
  return {
    postcode: "31000",
    city: "TOULOUSE",
    country: "France",
    ...overrides,
  };
}

describe("mapUsage", () => {
  const casVoulus: Array<[Usage, LotCategoryEstale]> = [
    ["residential", "RESIDENTIAL"],
    ["office", "OFFICE"],
    ["commercial", "COMMERCIAL"],
    ["mixed", "MIXED"],
    ["parking", "PARKING"],
    ["other", "OTHER"],
  ];

  it.each(casVoulus)('mappe l\'usage "%s" vers LotCategory "%s" sans avertissement', (usage, category) => {
    const avertissements: AvertissementMapping[] = [];
    expect(mapUsage(usage, avertissements)).toBe(category);
    expect(avertissements).toHaveLength(0);
  });

  it("replie sur OTHER avec avertissement quand la valeur est inconnue (cast force)", () => {
    const avertissements: AvertissementMapping[] = [];
    const inconnu = "inexistant" as unknown as Usage;
    expect(mapUsage(inconnu, avertissements)).toBe("OTHER");
    expect(avertissements.map((a) => a.code)).toContain("MAP_USAGE_INCONNU");
  });
});

describe("mapCivilite", () => {
  const casVoulus: Array<[Civilite, CivilityEstale]> = [
    ["m", "M"],
    ["mme", "MME"],
    ["m&mme", "MandMME"],
    ["m|mme", "MorMME"],
    ["indivision", "INDIVISION"],
    ["sdc", "SDC"],
  ];

  it.each(casVoulus)('mappe la civilite "%s" vers Civility "%s" sans avertissement', (civilite, civility) => {
    const avertissements: AvertissementMapping[] = [];
    expect(mapCivilite(civilite, avertissements)).toBe(civility);
    expect(avertissements).toHaveLength(0);
  });

  it("replie sur M avec avertissement quand la civilite est inconnue (cast force)", () => {
    const avertissements: AvertissementMapping[] = [];
    const inconnue = "inexistante" as unknown as Civilite;
    expect(mapCivilite(inconnue, avertissements)).toBe("M");
    expect(avertissements.map((a) => a.code)).toContain("MAP_CIVILITE_INCONNUE");
  });
});

describe("mapLot", () => {
  it("inclut tous les champs optionnels quand ils sont presents", () => {
    const avertissements: AvertissementMapping[] = [];
    const l = lot({
      numero: 12,
      etage: 3,
      escalier: "A",
      porte: "12",
      surface: 45.5,
      nbPiece: 2,
      commentaire: "T2 avec balcon",
    });
    const result = mapLot(l, avertissements);
    expect(result).toEqual({
      type: "Appartement",
      use: "RESIDENTIAL",
      num: "12",
      floor: 3,
      staircase: "A",
      door: "12",
      size: 45.5,
      rooms: 2,
      comment: "T2 avec balcon",
    });
  });

  it("omet les champs optionnels absents (et le commentaire vide)", () => {
    const avertissements: AvertissementMapping[] = [];
    const l = lot({ numero: 5, commentaire: "" });
    const result = mapLot(l, avertissements);
    expect(result).toEqual({
      type: "Appartement",
      use: "RESIDENTIAL",
      num: "5",
    });
    expect(result).not.toHaveProperty("floor");
    expect(result).not.toHaveProperty("staircase");
    expect(result).not.toHaveProperty("door");
    expect(result).not.toHaveProperty("size");
    expect(result).not.toHaveProperty("rooms");
    expect(result).not.toHaveProperty("comment");
  });

  it("laisse passer l'etage RDC (0) sans l'omettre (piege du falsy)", () => {
    const avertissements: AvertissementMapping[] = [];
    const result = mapLot(lot({ etage: 0 }), avertissements);
    expect(result.floor).toBe(0);
    expect(result).toHaveProperty("floor");
  });

  it("laisse passer l'etage sous-sol (-1) sans l'omettre", () => {
    const avertissements: AvertissementMapping[] = [];
    const result = mapLot(lot({ etage: -1 }), avertissements);
    expect(result.floor).toBe(-1);
  });
});

describe("mapCle", () => {
  it("cas nominal : libelle court, pas de commentaire -> aucune troncature ni avertissement", () => {
    const avertissements: AvertissementMapping[] = [];
    const result = mapCle(cle({ code: "001", libelle: "Charges generales", totalAttendu: 1000 }), avertissements);
    expect(result).toEqual({
      name: "Charges generales",
      code: "001",
      tantieme: 1000,
    });
    expect(avertissements).toHaveLength(0);
  });

  it("tronque le libelle > 80 caracteres et reporte le reste dans comment, avec avertissement", () => {
    const avertissements: AvertissementMapping[] = [];
    const libelleLong = "A".repeat(90); // 90 car, aucun commentaire existant
    const result = mapCle(cle({ libelle: libelleLong, commentaire: undefined }), avertissements);
    expect(result.name).toBe("A".repeat(80));
    expect(result.name.length).toBe(80);
    expect(result.comment).toBe("A".repeat(10));
    expect(avertissements.map((a) => a.code)).toContain("MAP_CLE_NOM_TRONQUE");
  });

  it("concatene le reste tronque AVANT un commentaire deja existant", () => {
    const avertissements: AvertissementMapping[] = [];
    const libelleLong = "B".repeat(85); // reste de 5 car "BBBBB"
    const result = mapCle(cle({ libelle: libelleLong, commentaire: "Note RCP existante" }), avertissements);
    expect(result.name).toBe("B".repeat(80));
    expect(result.comment).toBe("BBBBB Note RCP existante");
    expect(avertissements.map((a) => a.code)).toContain("MAP_CLE_NOM_TRONQUE");
  });

  it("plafonne le commentaire final a 500 caracteres, meme sans troncature du libelle", () => {
    const avertissements: AvertissementMapping[] = [];
    const commentaireLong = "X".repeat(600);
    const result = mapCle(cle({ libelle: "Charges", commentaire: commentaireLong }), avertissements);
    expect(result.name).toBe("Charges");
    expect(result.comment).toHaveLength(500);
    expect(result.comment).toBe("X".repeat(500));
    // Le libelle n'a pas ete tronque : pas d'avertissement MAP_CLE_NOM_TRONQUE ici.
    expect(avertissements.map((a) => a.code)).not.toContain("MAP_CLE_NOM_TRONQUE");
  });
});

describe("mapOwner", () => {
  it("resident=false par defaut quand occupant est inconnu (sans adresseCopro), avec avertissement", () => {
    const avertissements: AvertissementMapping[] = [];
    const result = mapOwner(owner(), avertissements);
    expect(result.owner.resident).toBe(false);
    expect(avertissements.map((a) => a.code)).toContain("MAP_OWNER_RESIDENT_INCONNU");
  });

  it("derive resident=true quand l'adresse du owner correspond a celle de la copro (CP + ville + voie incluse)", () => {
    const avertissements: AvertissementMapping[] = [];
    const o = owner({
      adrCodePostal: "31000",
      adrVille: "TOULOUSE",
      adrVoie: "RUE DE LA REPUBLIQUE",
    });
    const adresseCopro = adresse({
      postcode: "31000",
      city: "TOULOUSE",
      street: "RUE DE LA REPUBLIQUE",
    });
    const result = mapOwner(o, avertissements, adresseCopro);
    expect(result.owner.resident).toBe(true);
    expect(avertissements.map((a) => a.code)).toContain("MAP_OWNER_RESIDENT_DERIVE");
    expect(avertissements.map((a) => a.code)).not.toContain("MAP_OWNER_RESIDENT_INCONNU");
  });

  it("NE derive PAS resident quand le code postal differe de celui de la copro", () => {
    const avertissements: AvertissementMapping[] = [];
    const o = owner({
      adrCodePostal: "75000",
      adrVille: "PARIS",
      adrVoie: "RUE DE LA REPUBLIQUE",
    });
    const adresseCopro = adresse({
      postcode: "31000",
      city: "TOULOUSE",
      street: "RUE DE LA REPUBLIQUE",
    });
    const result = mapOwner(o, avertissements, adresseCopro);
    expect(result.owner.resident).toBe(false);
    expect(avertissements.map((a) => a.code)).toContain("MAP_OWNER_RESIDENT_INCONNU");
    expect(avertissements.map((a) => a.code)).not.toContain("MAP_OWNER_RESIDENT_DERIVE");
  });

  it("occupant=true explicite -> resident=true sans aucun avertissement", () => {
    const avertissements: AvertissementMapping[] = [];
    const o = owner({
      occupant: true,
      adrCodePostal: "31000",
      adrVille: "TOULOUSE",
    });
    const result = mapOwner(o, avertissements);
    expect(result.owner.resident).toBe(true);
    expect(avertissements).toHaveLength(0);
  });

  it("personne morale sans prenom -> firstname 'SERVICE SYNDIC' par defaut, avec avertissement", () => {
    const avertissements: AvertissementMapping[] = [];
    const o = owner({ pro: true, nom: "SCI BELLEVUE", raisonSociale: "SCI BELLEVUE", prenom: undefined });
    const result = mapOwner(o, avertissements);
    expect(result.owner.firstname).toBe("SERVICE SYNDIC");
    expect(avertissements.map((a) => a.code)).toContain("MAP_OWNER_REPRESENTANT_DEFAUT");
  });

  it("personne morale AVEC prenom (representant identifie) -> le prenom est conserve, pas d'avertissement", () => {
    const avertissements: AvertissementMapping[] = [];
    const o = owner({ pro: true, nom: "SCI BELLEVUE", raisonSociale: "SCI BELLEVUE", prenom: "Jean Dupont" });
    const result = mapOwner(o, avertissements);
    expect(result.owner.firstname).toBe("Jean Dupont");
    expect(avertissements.map((a) => a.code)).not.toContain("MAP_OWNER_REPRESENTANT_DEFAUT");
  });

  it("adresse incomplete (postcode/ville absents) -> avertissement, postcode/city vides, country France", () => {
    const avertissements: AvertissementMapping[] = [];
    const result = mapOwner(owner(), avertissements);
    expect(result.address.postcode).toBe("");
    expect(result.address.city).toBe("");
    expect(result.address.country).toBe("France");
    expect(avertissements.map((a) => a.code)).toContain("MAP_OWNER_ADRESSE_INCOMPLETE");
  });

  it("decoupe le numero de voie '176 BIS' : housenumber '176', le suffixe rejoint la voie", () => {
    const avertissements: AvertissementMapping[] = [];
    const o = owner({ adrNum: "176 BIS", adrVoie: "RUE GALLIENI" });
    const result = mapOwner(o, avertissements);
    expect(result.address.housenumber).toBe("176");
    expect(result.address.street).toBe("BIS RUE GALLIENI");
  });

  it("garde un numero compose '64-66' entier (pas de scission en pseudo-suffixe)", () => {
    const avertissements: AvertissementMapping[] = [];
    const o = owner({ adrNum: "64-66", adrVoie: "BOULEVARD X" });
    const result = mapOwner(o, avertissements);
    expect(result.address.housenumber).toBe("64-66");
    expect(result.address.street).toBe("BOULEVARD X");
    expect(avertissements.map((a) => a.code)).not.toContain("MAP_OWNER_NUM_TRONQUE");
  });

  it("tronque un numero pur (sans suffixe) de plus de 5 caracteres, avec avertissement", () => {
    const avertissements: AvertissementMapping[] = [];
    const o = owner({ adrNum: "123456", adrVoie: "RUE X" });
    const result = mapOwner(o, avertissements);
    expect(result.address.housenumber).toBe("12345");
    expect(avertissements.map((a) => a.code)).toContain("MAP_OWNER_NUM_TRONQUE");
  });
});

describe("adresseCorrespondCopro", () => {
  it("est insensible a la casse et aux accents (Courbevoie vs COURBEVOIE, Creteil vs CRETEIL)", () => {
    const o = owner({
      adrCodePostal: "94000",
      adrVille: "Créteil",
      adrVoie: "Rue de Paris",
    });
    const adresseCopro = adresse({ postcode: "94000", city: "CRETEIL", street: "RUE DE PARIS" });
    expect(adresseCorrespondCopro(o, adresseCopro)).toBe(true);
  });

  it("renvoie false si le code postal du owner est absent", () => {
    const o = owner({ adrVille: "TOULOUSE" });
    expect(adresseCorrespondCopro(o, adresse())).toBe(false);
  });

  it("renvoie true si CP + ville correspondent et que les deux voies sont vides", () => {
    const o = owner({ adrCodePostal: "31000", adrVille: "TOULOUSE" });
    const adresseCopro = adresse({ postcode: "31000", city: "TOULOUSE" });
    expect(adresseCorrespondCopro(o, adresseCopro)).toBe(true);
  });
});

describe("construireLiensLot", () => {
  it("1 seul owner sur le lot -> representative=true, share=100", () => {
    const avertissements: AvertissementMapping[] = [];
    const attributions: Attribution[] = [{ ownerId: "a", lot: 1 }];
    const map = new Map([["a", "owner#1"]]);
    const result = construireLiensLot(attributions, map, avertissements);
    expect(result).toHaveLength(1);
    expect(result[0]!.representative).toBe(true);
    expect(result[0]!.share).toBe(100);
    expect(result[0]!.division).toBe("FREEHOLD");
    expect(result[0]!.ownerID).toBe("owner#1");
    expect(avertissements).toHaveLength(0);
  });

  it("3 owners sur le lot -> parts a egalite (100/3) et avertissement MAP_LINK_SHARE_EGALE", () => {
    const avertissements: AvertissementMapping[] = [];
    const attributions: Attribution[] = [
      { ownerId: "a", lot: 1 },
      { ownerId: "b", lot: 1 },
      { ownerId: "c", lot: 1 },
    ];
    const map = new Map([
      ["a", "owner#1"],
      ["b", "owner#2"],
      ["c", "owner#3"],
    ]);
    const result = construireLiensLot(attributions, map, avertissements);
    expect(result).toHaveLength(3);
    result.forEach((r) => expect(r.share).toBe(100 / 3));
    expect(result[0]!.representative).toBe(true);
    expect(result[1]!.representative).toBe(false);
    expect(result[2]!.representative).toBe(false);
    expect(avertissements.map((a) => a.code)).toContain("MAP_LINK_SHARE_EGALE");
  });

  it("leve une erreur si un owner de l'attribution n'a pas d'ID eStale capture", () => {
    const avertissements: AvertissementMapping[] = [];
    const attributions: Attribution[] = [{ ownerId: "inconnu", lot: 7 }];
    const map = new Map<string, string>();
    expect(() => construireLiensLot(attributions, map, avertissements)).toThrow(/non capture/);
  });
});
