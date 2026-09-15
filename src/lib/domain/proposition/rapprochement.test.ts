import { describe, expect, it } from "vitest";
import { analyserAdresse, comparer, immatriculationDansTexte, rapprocher, requeteRegistre, type CandidatRegistre } from "./rapprochement";

const VOIES_DU_BOIS: CandidatRegistre = { immatriculation: "AE8696023", adresse: "222 r des voies du bois", commune: "Colombes", codePostal: "92700" };
const VOIES_DU_BOIS_22: CandidatRegistre = { immatriculation: "AE0000022", adresse: "22 r des voies du bois", commune: "Colombes", codePostal: "92700" };

describe("analyserAdresse", () => {
  it("lit le suffixe agence du cabinet", () => {
    expect(analyserAdresse("62, rue Jean Bonal - LGC")).toEqual({ numeros: ["62"], voie: ["jean", "bonal"], typeVoie: "rue", commune: "la garenne colombes" });
  });
  it("lit une commune en clair et plusieurs numeros", () => {
    expect(analyserAdresse("2/4/4 bis avenue Rhin et Danube - Courbevoie")).toEqual({ numeros: ["2", "4", "4bis"], voie: ["rhin", "danube"], typeVoie: "avenue", commune: "courbevoie" });
  });
  it("lit un code postal suivi de la commune", () => {
    expect(analyserAdresse("3, rue Raspail - 92400 COURBEVOIE")).toEqual({ numeros: ["3"], voie: ["raspail"], typeVoie: "rue", commune: "courbevoie", codePostal: "92400" });
    expect(analyserAdresse("139 av République 78500 sartrouville")).toEqual({ numeros: ["139"], voie: ["republique"], typeVoie: "avenue", commune: "sartrouville", codePostal: "78500" });
  });
  it("lit « à » et un arrondissement de Paris", () => {
    expect(analyserAdresse("56 rue Maurice Bokanowski à Asnières sur Seine").commune).toBe("asnieres sur seine");
    expect(analyserAdresse("81 avenue de Saint Ouen - Paris (17eme)").commune).toBe("paris");
  });
  it("sans commune ecrite, ne devine rien", () => {
    expect(analyserAdresse("16, rue du Château")).toEqual({ numeros: ["16"], voie: ["chateau"], typeVoie: "rue" });
  });
  it("lit les numeros en serie et le 27bis", () => {
    expect(analyserAdresse("1 3 5 7 9 rue Voltaire - LGC").numeros).toEqual(["1", "3", "5", "7", "9"]);
    expect(analyserAdresse("27bis, Bd de la République LGC").numeros).toEqual(["27bis"]);
  });
});

describe("comparer", () => {
  const saisie = analyserAdresse("222, rue des Voies du Bois - COLOMBES");
  it("sur : meme numero, meme voie, meme commune", () => {
    expect(comparer(saisie, VOIES_DU_BOIS)).toBe("sur");
  });
  it("non : 22 n'est pas 222", () => {
    expect(comparer(saisie, VOIES_DU_BOIS_22)).toBe("non");
  });
  it("probable : commune inconnue", () => {
    expect(comparer(analyserAdresse("222 rue des voies du bois"), VOIES_DU_BOIS)).toBe("probable");
  });
  it("sur : Asnières vaut Asnières-sur-Seine", () => {
    const c: CandidatRegistre = { immatriculation: "X", adresse: "24 r de champagne", commune: "Asnières-sur-Seine", codePostal: "92600" };
    expect(comparer(analyserAdresse("24, rue de Champagne - Asnières"), c)).toBe("sur");
  });
  it("probable : 52 ter contre 52 au registre", () => {
    const c: CandidatRegistre = { immatriculation: "X", adresse: "52 Rue Médéric", commune: "La Garenne-Colombes", codePostal: "92250" };
    expect(comparer(analyserAdresse("52 ter rue Médéric - LGC"), c)).toBe("probable");
  });
  it("sur : par une adresse complementaire de l'immeuble", () => {
    const c: CandidatRegistre = { immatriculation: "X", adresse: "12 r sartoris", adressesCompl: ["45 r sartoris", "12 r voltaire"], commune: "La Garenne-Colombes", codePostal: "92250" };
    expect(comparer(analyserAdresse("45 rue Sartoris - LGC"), c)).toBe("sur");
  });
  it("probable : rue contre boulevard", () => {
    const c: CandidatRegistre = { immatriculation: "X", adresse: "30 bd belle rive", commune: "Rueil-Malmaison", codePostal: "92500" };
    expect(comparer(analyserAdresse("30 rue Belle Rive - Rueil Malmaison"), c)).toBe("probable");
  });
  it("non : autre commune, meme si le type de voie differe", () => {
    const c: CandidatRegistre = { immatriculation: "X", adresse: "71 av du general de gaulle", adressesCompl: ["27 r jules guesde 92130 Issy-les-Moulineaux"], commune: "Issy-les-Moulineaux", codePostal: "92130" };
    expect(comparer(analyserAdresse("27 Avenue Jules Guesde - Achères"), c)).toBe("non");
  });
  it("non : autre commune", () => {
    expect(comparer(analyserAdresse("222 rue des voies du bois - Bois-Colombes"), VOIES_DU_BOIS)).toBe("non");
  });
});

describe("rapprocher", () => {
  it("rattache seul quand un seul candidat est sur", () => {
    const r = rapprocher(analyserAdresse("222, rue des Voies du Bois - COLOMBES"), [VOIES_DU_BOIS, VOIES_DU_BOIS_22]);
    expect(r.sur?.immatriculation).toBe("AE8696023");
  });
  it("laisse le choix quand la commune manque", () => {
    const r = rapprocher(analyserAdresse("222 rue des voies du bois"), [VOIES_DU_BOIS, VOIES_DU_BOIS_22]);
    expect(r.sur).toBeUndefined();
    expect(r.candidats.map((c) => c.immatriculation)).toEqual(["AE8696023"]);
  });
  it("laisse le choix quand deux candidats sont surs", () => {
    const doublon = { ...VOIES_DU_BOIS, immatriculation: "AE9999999" };
    const r = rapprocher(analyserAdresse("222, rue des Voies du Bois - COLOMBES"), [VOIES_DU_BOIS, doublon]);
    expect(r.sur).toBeUndefined();
    expect(r.candidats).toHaveLength(2);
  });
  it("forme la requete du registre", () => {
    expect(requeteRegistre(analyserAdresse("2/4/4 bis avenue Rhin et Danube - LGC"))).toEqual({ numeros: ["2", "4"], voie: ["rhin", "danube"] });
  });
  it("lit une immatriculation ecrite dans l'adresse", () => {
    expect(immatriculationDansTexte("120 - 130 Place andré Malraux - HLS AD0957118")).toBe("AD0957118");
    expect(immatriculationDansTexte("12 rue de Paris")).toBeUndefined();
  });
  it("lit le code agence colle par un tiret", () => {
    expect(analyserAdresse("61 rue sartoris-LGC").commune).toBe("la garenne colombes");
  });
  it("lit le code agence colle en fin", () => {
    expect(analyserAdresse("84 bis av Foch LGC")).toEqual({ numeros: ["84bis"], voie: ["foch"], typeVoie: "avenue", commune: "la garenne colombes" });
  });
});
