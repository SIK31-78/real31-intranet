import { describe, expect, it } from "vitest";
import { agencesEcriture, niveauEcriture, peutDeleguer, peutEcrire, voieEcriture, type Delegation } from "./perimetre-ecriture";

const delphine = { id: "delphine", roleTable: "GESTIONNAIRE", agenceCode: "ML" };
const julie = { id: "julie", roleTable: "ASSISTANT", agenceCode: "ML" };
const dimitri = { id: "dimitri", roleTable: "DIRECTEUR_SYNDIC", agenceCode: "ML" };
const sandrine = { id: "sandrine", roleTable: "DIRECTEUR_AGENCE", agenceCode: "ML" };
const nicolas = { id: "nicolas", roleTable: "GESTIONNAIRE", agenceCode: "HLS", habilitations: ["referent_syndic:HLS", "propositions"] };
const titouan = { id: "titouan", roleTable: "GESTIONNAIRE", agenceCode: "ML", habilitations: ["referent_syndic:HLS"] };
const emmanuel = { id: "emmanuel", roleTable: "ADMIN", agenceCode: "LGC" };
const remi = { id: "remi", roleTable: "GESTIONNAIRE", agenceCode: "LGC" };
const sekou = { id: "sekou", roleTable: "AUTRE", superAdmin: true };

const s100 = { code: "S100", managerId: "delphine", assistantId: "julie", agenceCode: "ML" };
const s200 = { code: "S200", managerId: "remi", assistantId: null, agenceCode: "LGC" };
const s300 = { code: "S300", managerId: "nicolas", assistantId: null, agenceCode: "HLS" };
const J = "2026-11-15";

describe("niveau et agences d'ecriture", () => {
  it("gestionnaire = portefeuille ; directeurs et referents = agence ; ADMIN et super-admin = cabinet", () => {
    expect(niveauEcriture(delphine)).toBe("portefeuille");
    expect(niveauEcriture(dimitri)).toBe("agence");
    expect(niveauEcriture(sandrine)).toBe("agence");
    expect(niveauEcriture(nicolas)).toBe("agence");
    expect(niveauEcriture(emmanuel)).toBe("cabinet");
    expect(niveauEcriture(sekou)).toBe("cabinet");
  });
  it("le referent ecrit sur l'agence de son habilitation, meme si ce n'est pas la sienne", () => {
    expect(agencesEcriture(titouan)).toEqual(["HLS"]);
    expect(agencesEcriture(dimitri)).toEqual(["ML"]);
    expect(agencesEcriture(remi)).toEqual([]);
  });
});

describe("voieEcriture", () => {
  it("le portefeuille d'abord : titulaire et assistant", () => {
    expect(voieEcriture(delphine, s100, [], J)).toBe("portefeuille");
    expect(voieEcriture(julie, s100, [], J)).toBe("portefeuille");
    expect(voieEcriture(remi, s100, [], J)).toBeNull();
  });
  it("le role : Dimitri ecrit sur ML, pas sur LGC ; Emmanuel partout", () => {
    expect(voieEcriture(dimitri, s100, [], J)).toBe("role");
    expect(voieEcriture(dimitri, s200, [], J)).toBeNull();
    expect(voieEcriture(titouan, s300, [], J)).toBe("role");
    expect(voieEcriture(titouan, s100, [], J)).toBeNull();
    expect(voieEcriture(emmanuel, s300, [], J)).toBe("role");
  });
  it("la delegation d'un portefeuille couvre les copros du titulaire, dans ses dates", () => {
    const d: Delegation = { id: "1", deUserId: "delphine", aUserId: "remi", portee: "portefeuille", depuisISO: "2026-10-01", jusquaISO: "2027-03-31", motif: "congé maternité" };
    expect(voieEcriture(remi, s100, [d], J)).toBe("delegation");
    expect(voieEcriture(remi, s100, [d], "2026-09-30")).toBeNull();
    expect(voieEcriture(remi, s100, [d], "2027-04-01")).toBeNull();
    expect(voieEcriture(remi, s200, [d], J)).toBe("portefeuille");
  });
  it("une delegation ne vaut que pour son beneficiaire", () => {
    const d: Delegation = { id: "1", deUserId: "delphine", aUserId: "remi", portee: "portefeuille", depuisISO: "2026-10-01" };
    expect(peutEcrire(titouan, s100, [d], J)).toBe(false);
  });
  it("delegation d'agence et de copro", () => {
    const agence: Delegation = { id: "2", deUserId: "dimitri", aUserId: "remi", portee: "agence", agenceCode: "ML", depuisISO: "2026-11-01" };
    const copro: Delegation = { id: "3", deUserId: "nicolas", aUserId: "remi", portee: "copro", coproCode: "S300", depuisISO: "2026-11-01" };
    expect(voieEcriture(remi, s100, [agence], J)).toBe("delegation");
    expect(voieEcriture(remi, s300, [agence], J)).toBeNull();
    expect(voieEcriture(remi, s300, [copro], J)).toBe("delegation");
  });
});

describe("peutDeleguer", () => {
  it("le titulaire pour lui-meme, la direction de son agence, le cabinet pour tous", () => {
    expect(peutDeleguer(delphine, delphine, "portefeuille")).toBe(true);
    expect(peutDeleguer(dimitri, delphine, "portefeuille")).toBe(true);
    expect(peutDeleguer(sandrine, delphine, "portefeuille")).toBe(true);
    expect(peutDeleguer(emmanuel, delphine, "portefeuille")).toBe(true);
    expect(peutDeleguer(remi, delphine, "portefeuille")).toBe(false);
    expect(peutDeleguer(titouan, delphine, "portefeuille")).toBe(false);
  });
  it("une delegation d'agence : par qui ecrit deja sur l'agence", () => {
    expect(peutDeleguer(dimitri, dimitri, "agence", "ML")).toBe(true);
    expect(peutDeleguer(dimitri, dimitri, "agence", "LGC")).toBe(false);
    expect(peutDeleguer(delphine, delphine, "agence", "ML")).toBe(false);
  });
});
