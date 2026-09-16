import { describe, expect, it } from "vitest";
import { estEnPoste, initialesDe, obstaclesArrivee, obstaclesDepart, planDeDepart, portefeuilleDe, type Collaborateur, type EquipeCopro } from "./collaborateur";

const equipes: EquipeCopro[] = [
  { code: "S004", nom: "A", statut: "active", managerId: "fanny", assistantId: "phoebe" },
  { code: "S014", nom: "B", statut: "active", managerId: "fanny", assistantId: "phoebe", accountantId: "elsa" },
  { code: "S999", nom: "C", statut: "inactive", managerId: "fanny", assistantId: "phoebe" },
  { code: "S200", nom: "D", statut: "active", managerId: "remi", assistantId: "galiano" },
];

describe("portefeuille", () => {
  it("compte les copros actives par role tenu", () => {
    const p = portefeuilleDe("phoebe", equipes);
    expect(p.assistant.map((e) => e.code)).toEqual(["S004", "S014"]);
    expect(p.gestionnaire).toEqual([]);
    expect(portefeuilleDe("fanny", equipes).gestionnaire).toHaveLength(2);
  });
  it("le plan de depart reaffecte chaque copro au remplacant du role", () => {
    const plan = planDeDepart("phoebe", equipes, { assistant: "victoria" });
    expect(plan).toEqual([
      { code: "S004", role: "assistant", de: "phoebe", vers: "victoria" },
      { code: "S014", role: "assistant", de: "phoebe", vers: "victoria" },
    ]);
  });
  it("un depart sans remplacant est refuse, et le remplacant n'est pas le partant", () => {
    const c: Collaborateur = { id: "phoebe", nomComplet: "Phoebé LAJUS", initiales: "PL", actif: true, habilitations: [] };
    expect(obstaclesDepart(c, "2026-09-16", planDeDepart("phoebe", equipes, {}))).toEqual(["2 copropriétés resteraient sans assistant : choisir un remplaçant"]);
    expect(obstaclesDepart(c, "2026-09-16", planDeDepart("phoebe", equipes, { assistant: "phoebe" }))).toContain("un remplaçant ne peut pas être la personne qui part");
    expect(obstaclesDepart(c, "2026-09-16", planDeDepart("phoebe", equipes, { assistant: "victoria" }))).toEqual([]);
  });
});

describe("arrivee", () => {
  it("exige prenom + nom, un e-mail real31 inconnu, un role connu", () => {
    expect(obstaclesArrivee({ nomComplet: "Victoria DORLEAC", email: "victoria.dorleac@real31.fr", roleTable: "ASSISTANT" }, ["fanny.sorivelle@real31.fr"])).toEqual([]);
    expect(obstaclesArrivee({ nomComplet: "Victoria", email: "v@gmail.com", roleTable: "ASSISTANT" }, [])).toEqual(["le prénom et le nom", "un e-mail @real31.fr"]);
    expect(obstaclesArrivee({ nomComplet: "Fanny SORIVELLE", email: "Fanny.Sorivelle@real31.fr", roleTable: "GESTIONNAIRE" }, ["fanny.sorivelle@real31.fr"])).toEqual(["fanny.sorivelle@real31.fr existe déjà"]);
  });
  it("initiales et en poste", () => {
    expect(initialesDe("Victoria DORLEAC")).toBe("VD");
    expect(initialesDe("Wilfrid-Huang TOHOUBI")).toBe("WT");
    expect(estEnPoste({ actif: true }, "2026-09-16")).toBe(true);
    expect(estEnPoste({ actif: true, departISO: "2026-09-16" }, "2026-09-16")).toBe(false);
    expect(estEnPoste({ actif: true, departISO: "2026-12-31" }, "2026-09-16")).toBe(true);
    expect(estEnPoste({ actif: false }, "2026-09-16")).toBe(false);
  });
});
