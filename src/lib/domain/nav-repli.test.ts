import { describe, expect, it } from "vitest";
import {
  analyserRepli,
  fusionnerRepli,
  repliDuModule,
  repliInitial,
  serialiserRepli,
} from "./nav-repli";

describe("analyserRepli", () => {
  it("lit une preference par module", () => {
    expect(analyserRepli("emails:1,accueil:0")).toEqual({ emails: true, accueil: false });
  });

  it("tolere les espaces et l'ordre", () => {
    expect(analyserRepli(" accueil:0 , emails:1 ")).toEqual({ accueil: false, emails: true });
  });

  it("ignore ce qui n'est pas exploitable plutot que de planter la page", () => {
    expect(analyserRepli("emails:oui,:1,sansdeuxpoints,copros:1")).toEqual({ copros: true });
    expect(analyserRepli(undefined)).toEqual({});
    expect(analyserRepli("")).toEqual({});
  });
});

describe("serialiserRepli", () => {
  it("produit un format relisible par analyserRepli (aller-retour)", () => {
    const prefs = { emails: false, accueil: true };
    expect(analyserRepli(serialiserRepli(prefs))).toEqual(prefs);
  });

  it("rend une chaine vide pour une preference vide", () => {
    expect(serialiserRepli({})).toBe("");
  });
});

describe("repliDuModule", () => {
  it("le mail est replie par defaut, les autres modules non", () => {
    expect(repliDuModule({}, "emails")).toBe(true);
    expect(repliDuModule({}, "accueil")).toBe(false);
    expect(repliDuModule({}, "copros")).toBe(false);
  });

  it("le choix de l'utilisateur l'emporte sur le defaut, dans les deux sens", () => {
    expect(repliDuModule({ emails: false }, "emails")).toBe(false);
    expect(repliDuModule({ accueil: true }, "accueil")).toBe(true);
  });

  it("un choix ne deborde jamais sur un autre module", () => {
    const prefs = { emails: false };
    expect(repliDuModule(prefs, "accueil")).toBe(false);
    expect(repliDuModule({ accueil: true }, "emails")).toBe(true);
  });
});

describe("repliInitial (ce que le serveur calcule)", () => {
  it("part du cookie brut", () => {
    expect(repliInitial("emails:0", "emails")).toBe(false);
    expect(repliInitial("emails:1", "emails")).toBe(true);
  });

  it("sans cookie, applique les defauts", () => {
    expect(repliInitial(undefined, "emails")).toBe(true);
    expect(repliInitial(undefined, "accueil")).toBe(false);
  });
});

describe("fusionnerRepli (ce que le client ecrit dans le cookie)", () => {
  it("pose la preference du module bascule", () => {
    expect(analyserRepli(fusionnerRepli("", "emails", false))).toEqual({ emails: false });
    expect(analyserRepli(fusionnerRepli("", "accueil", true))).toEqual({ accueil: true });
  });

  it("N'EFFACE PAS la preference des autres modules", () => {
    const apres = fusionnerRepli("emails:1,copros:0", "accueil", true);
    expect(analyserRepli(apres)).toEqual({ emails: true, copros: false, accueil: true });
  });

  it("ecrase la valeur du module deja present, sans le dupliquer", () => {
    const apres = fusionnerRepli("emails:1,accueil:0", "emails", false);
    expect(analyserRepli(apres)).toEqual({ emails: false, accueil: false });
    expect(apres.match(/emails:/g)).toHaveLength(1);
  });

  it("repart proprement d'un cookie illisible plutot que de propager l'erreur", () => {
    expect(analyserRepli(fusionnerRepli("n'importe quoi", "emails", true))).toEqual({
      emails: true,
    });
  });
});
