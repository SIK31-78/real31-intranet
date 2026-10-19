import { describe, expect, it } from "vitest";
import { VERSION_INCONNUE, estErreurVersionPerimee, rechargerTout, versionChangee, versionDuBuild } from "./version-app";

describe("versionDuBuild", () => {
  it("préfère l'identifiant de déploiement, puis le commit, puis la valeur de repli", () => {
    expect(versionDuBuild({ VERCEL_DEPLOYMENT_ID: "dpl_1", VERCEL_GIT_COMMIT_SHA: "abc" })).toBe("dpl_1");
    expect(versionDuBuild({ VERCEL_GIT_COMMIT_SHA: "abc" })).toBe("abc");
    expect(versionDuBuild({})).toBe(VERSION_INCONNUE);
  });
});

describe("versionChangee", () => {
  it("signale une version différente", () => {
    expect(versionChangee("dpl_1", "dpl_2")).toBe(true);
    expect(versionChangee("dpl_1", "dpl_1")).toBe(false);
  });

  it("ne signale rien quand une des deux est inconnue", () => {
    expect(versionChangee(VERSION_INCONNUE, "dpl_2")).toBe(false);
    expect(versionChangee("dpl_1", VERSION_INCONNUE)).toBe(false);
    expect(versionChangee("dpl_1", null)).toBe(false);
    expect(versionChangee("dpl_1", "")).toBe(false);
  });
});

describe("estErreurVersionPerimee", () => {
  it("reconnaît l'erreur de Next par son nom ou son message", () => {
    expect(estErreurVersionPerimee({ name: "UnrecognizedActionError", message: "x" })).toBe(true);
    expect(estErreurVersionPerimee(new Error('Server Action "402cd524" was not found on the server.'))).toBe(true);
  });

  it("ignore les autres erreurs", () => {
    expect(estErreurVersionPerimee(new Error("fetch failed"))).toBe(false);
    expect(estErreurVersionPerimee(null)).toBe(false);
    expect(estErreurVersionPerimee("Server Action")).toBe(false);
  });
});

describe("rechargement automatique d'un onglet périmé", () => {
  const base = { nouvelleVersion: true, cacheDepuisMs: 3 * 60 * 60 * 1000, saisieEnCours: false, fenetreOuverte: false };
  it("recharge un onglet laissé de côté quand une nouvelle version est en ligne", () => {
    expect(rechargerTout(base)).toBe(true);
  });
  it("ne recharge jamais une saisie en cours, une fenêtre ouverte, ni sans nouvelle version", () => {
    expect(rechargerTout({ ...base, saisieEnCours: true })).toBe(false);
    expect(rechargerTout({ ...base, fenetreOuverte: true })).toBe(false);
    expect(rechargerTout({ ...base, nouvelleVersion: false })).toBe(false);
  });
  it("un aller-retour rapide sur un autre onglet ne recharge pas", () => {
    expect(rechargerTout({ ...base, cacheDepuisMs: 20_000 })).toBe(false);
  });
});
