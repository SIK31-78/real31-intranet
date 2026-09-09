import { describe, expect, it } from "vitest";
import {
  CORRESPONDANCE_ANCIENS_CODES,
  ETAPES_REPRISE,
  PHASES,
  ajouterEtapeAdHoc,
  assignerParRole,
  avancement,
  creerDossier,
  etapeCourante,
  etapesParDefaut,
  phaseCourante,
  prochainCodeAdHoc,
  reconcilierEtapes,
} from "../dossier";
import type { EquipeReprise, Etape } from "../dossier";

const sekou = { id: "u-sekou", nom: "Sekou" };
const marie = { id: "u-marie", nom: "Marie" };
const paul = { id: "u-paul", nom: "Paul" };
const equipe: EquipeReprise = { referent: sekou, gestionnaire: marie, comptable: paul };
/** Taille de la checklist canonique v3 (6 CA + 7 DO + 7 BA + 3 CO + 3 PA + 8 CP + 10 EX + 3 CL). */
const N = ETAPES_REPRISE.length;

function statut(etapes: Etape[], code: string) {
  return etapes.find((e) => e.code === code)?.statut;
}

describe("checklist canonique v3", () => {
  it("compte 47 etapes, codes uniques, phases connues, un role par etape", () => {
    expect(ETAPES_REPRISE).toHaveLength(47);
    const codes = ETAPES_REPRISE.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const e of ETAPES_REPRISE) {
      expect(PHASES).toContain(e.phase);
      expect(e.role).toBeDefined();
    }
    // Les phases apparaissent dans l'ordre chronologique.
    const ordre = ETAPES_REPRISE.map((e) => PHASES.indexOf(e.phase));
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre);
  });

  it("etapesParDefaut : toutes a_faire, non assignees sans equipe", () => {
    const etapes = etapesParDefaut();
    expect(etapes).toHaveLength(N);
    expect(etapes.every((e) => e.statut === "a_faire")).toBe(true);
    expect(etapes.every((e) => e.assigneA === undefined)).toBe(true);
  });

  it("etapesParDefaut : assignees d'apres l'equipe (role -> personne), les roles absents restent libres", () => {
    const etapes = etapesParDefaut(equipe);
    expect(etapes.find((e) => e.code === "CA6")!.assigneA).toEqual(sekou); // referent
    expect(etapes.find((e) => e.code === "CA1")!.assigneA).toEqual(marie); // gestionnaire
    expect(etapes.find((e) => e.code === "BA7")!.assigneA).toEqual(paul); // comptable
    expect(etapes.find((e) => e.code === "BA2")!.assigneA).toBeUndefined(); // assistant non nomme
  });

  it("creerDossier pose ref/nom/adresse/sortant/dateBascule/equipe", () => {
    const d = creerDossier("S0302", "Gabriel Péri", "44 rue X", { sortant: "Foncia", dateBascule: "2026-01-01", equipe });
    expect(d.ref).toBe("S0302");
    expect(d.statut).toBe("production");
    expect(d.adresse).toBe("44 rue X");
    expect(d.sortant).toBe("Foncia");
    expect(d.dateBascule).toBe("2026-01-01");
    expect(d.equipe).toEqual(equipe);
    expect(d.etapes).toHaveLength(N);
    expect(d.journal).toEqual([]);
    // Sans options : aucune cle optionnelle posee (JSONB propre).
    const nu = creerDossier("S0303", "Nu");
    expect("sortant" in nu).toBe(false);
    expect("equipe" in nu).toBe(false);
  });

  it("toute correspondance d'ancien code vise un code canonique existant", () => {
    const codes = new Set(ETAPES_REPRISE.map((e) => e.code));
    for (const cible of Object.values(CORRESPONDANCE_ANCIENS_CODES)) expect(codes.has(cible)).toBe(true);
  });
});

describe("reconcilierEtapes (migration douce)", () => {
  it("reporte un ancien code R* coche sur son nouveau code (R1 fait -> DO2 fait)", () => {
    const r = reconcilierEtapes([{ code: "R1", phase: "PATRIMOINE", libelle: "GL", statut: "fait" }]);
    expect(r).toHaveLength(N);
    expect(statut(r, "DO2")).toBe("fait");
    expect(r.some((e) => e.code === "R1")).toBe(false);
  });

  it("deux anciens codes vers la meme cible : le plus avance gagne (R6 fait + RG1 en_cours -> CP1 fait)", () => {
    const r1 = reconcilierEtapes([
      { code: "R6", phase: "COMPTABILITE", libelle: "x", statut: "fait" },
      { code: "RG1", phase: "COMPTABILITE", libelle: "y", statut: "en_cours" },
    ]);
    expect(statut(r1, "CP1")).toBe("fait");
    // Ordre inverse : meme resultat.
    const r2 = reconcilierEtapes([
      { code: "RG1", phase: "COMPTABILITE", libelle: "y", statut: "en_cours" },
      { code: "R6", phase: "COMPTABILITE", libelle: "x", statut: "fait" },
    ]);
    expect(statut(r2, "CP1")).toBe("fait");
  });

  it("un ancien code n'ecrase pas un statut plus avance deja porte par le nouveau code", () => {
    const r = reconcilierEtapes([
      { code: "DO2", phase: "DOCUMENTS", libelle: "x", statut: "fait" },
      { code: "R1", phase: "PATRIMOINE", libelle: "y", statut: "en_cours" },
    ]);
    expect(statut(r, "DO2")).toBe("fait");
  });

  it("une etape canonique persistee reporte statut, assignee, note, echeance, majLe (libelle/phase/role = canon)", () => {
    const r = reconcilierEtapes([
      {
        code: "BA2",
        phase: "CADRAGE", // faux : doit etre corrige
        libelle: "vieux libelle",
        statut: "bloque",
        assigneA: marie,
        note: "La banque ne répond pas",
        echeance: "2026-09-15",
        majLe: "2026-09-09T10:00:00.000Z",
        majPar: "Sekou",
      },
    ]);
    const ba2 = r.find((e) => e.code === "BA2")!;
    expect(ba2.statut).toBe("bloque");
    expect(ba2.assigneA).toEqual(marie);
    expect(ba2.note).toBe("La banque ne répond pas");
    expect(ba2.echeance).toBe("2026-09-15");
    expect(ba2.majLe).toBe("2026-09-09T10:00:00.000Z");
    expect(ba2.majPar).toBe("Sekou");
    expect(ba2.phase).toBe("BANQUE");
    expect(ba2.libelle).toBe(ETAPES_REPRISE.find((e) => e.code === "BA2")!.libelle);
    expect(ba2.role).toBe("assistant");
  });

  it("une etape ad hoc est TOUJOURS conservee (meme a_faire) et placee juste apres son apresCode", () => {
    const r = reconcilierEtapes([
      { code: "X-1", phase: "BANQUE", libelle: "Relancer la banque", statut: "a_faire", adHoc: true, apresCode: "BA2" },
    ]);
    expect(r).toHaveLength(N + 1);
    const idx = r.findIndex((e) => e.code === "X-1");
    expect(r[idx - 1]!.code).toBe("BA2");
    expect(r[idx + 1]!.code).toBe("BA3");
  });

  it("une etape ad hoc sans apresCode (ou apresCode inconnu) va en fin de sa phase", () => {
    const r = reconcilierEtapes([
      { code: "X-1", phase: "BANQUE", libelle: "Divers banque", statut: "a_faire", adHoc: true },
      { code: "X-2", phase: "CADRAGE", libelle: "Divers cadrage", statut: "fait", adHoc: true, apresCode: "ZZZ" },
    ]);
    const i1 = r.findIndex((e) => e.code === "X-1");
    expect(r[i1 - 1]!.code).toBe("BA7");
    expect(r[i1 + 1]!.code).toBe("CO1");
    const i2 = r.findIndex((e) => e.code === "X-2");
    expect(r[i2 - 1]!.code).toBe("CA6");
    expect(r[i2 + 1]!.code).toBe("DO1");
  });

  it("une ancienne etape P/V/C est conservee si != a_faire, phase traduite, en fin de liste ; droppee sinon", () => {
    const r = reconcilierEtapes([
      { code: "P1", phase: "PATRIMOINE", libelle: "Preparation", statut: "a_faire" },
      { code: "P3", phase: "PATRIMOINE", libelle: "Production", statut: "fait" },
      { code: "V1", phase: "VERIFICATION" as never, libelle: "Apres lots", statut: "ignore" },
      { code: "CLOTURE", phase: "MISE_EN_SERVICE" as never, libelle: "Cloture", statut: "fait" },
      { code: "O1", phase: "OFFRE" as never, libelle: "Offre", statut: "fait" },
      { code: "Z9", phase: "INCONNUE" as never, libelle: "?", statut: "en_cours" },
    ]);
    const codes = r.map((e) => e.code);
    expect(codes.slice(0, N)).toEqual(ETAPES_REPRISE.map((e) => e.code));
    expect(codes.slice(N)).toEqual(["P3", "V1", "CLOTURE", "O1", "Z9"]);
    expect(r.find((e) => e.code === "V1")!.phase).toBe("PATRIMOINE");
    expect(r.find((e) => e.code === "CLOTURE")!.phase).toBe("EXPLOITATION");
    expect(r.find((e) => e.code === "O1")!.phase).toBe("CADRAGE");
    expect(r.find((e) => e.code === "Z9")!.phase).toBe("EXPLOITATION");
  });

  it("est idempotente (reconcilier(reconcilier(x)) == reconcilier(x)) sur un melange complet", () => {
    const melange: Etape[] = [
      { code: "R1", phase: "PATRIMOINE", libelle: "GL", statut: "fait" },
      { code: "BA2", phase: "BANQUE", libelle: "IBAN", statut: "en_cours", assigneA: marie, note: "n" },
      { code: "X-1", phase: "BANQUE", libelle: "Ad hoc", statut: "a_faire", adHoc: true, apresCode: "BA2" },
      { code: "P3", phase: "PATRIMOINE", libelle: "Production", statut: "fait" },
    ];
    const une = reconcilierEtapes(melange);
    const deux = reconcilierEtapes(une);
    expect(deux).toEqual(une);
  });

  it("ne mute pas les etapes d'entree", () => {
    const entree: Etape[] = [{ code: "BA2", phase: "BANQUE", libelle: "IBAN", statut: "fait" }];
    const copie = structuredClone(entree);
    reconcilierEtapes(entree);
    expect(entree).toEqual(copie);
  });
});

describe("etapeCourante / phaseCourante", () => {
  it("bloque > en_cours > a_faire, dans l'ordre de la checklist", () => {
    const etapes = etapesParDefaut();
    expect(etapeCourante(etapes)!.code).toBe("CA1"); // premiere a_faire
    etapes.find((e) => e.code === "CA1")!.statut = "fait";
    expect(etapeCourante(etapes)!.code).toBe("CA2");
    etapes.find((e) => e.code === "EX3")!.statut = "en_cours";
    expect(etapeCourante(etapes)!.code).toBe("EX3"); // en_cours prime sur a_faire plus tot
    etapes.find((e) => e.code === "CL2")!.statut = "bloque";
    expect(etapeCourante(etapes)!.code).toBe("CL2"); // bloque prime sur tout
    expect(phaseCourante(etapes)).toBe("CLOTURE");
  });

  it("undefined quand tout est fait ou ignore", () => {
    const etapes = etapesParDefaut().map((e, i) => ({ ...e, statut: i % 2 ? ("fait" as const) : ("ignore" as const) }));
    expect(etapeCourante(etapes)).toBeUndefined();
    expect(phaseCourante(etapes)).toBeUndefined();
  });
});

describe("ajouterEtapeAdHoc / prochainCodeAdHoc", () => {
  it("genere X-1, X-2... et ne reutilise jamais un code meme apres suppression", () => {
    let etapes = etapesParDefaut();
    expect(prochainCodeAdHoc(etapes)).toBe("X-1");
    etapes = ajouterEtapeAdHoc(etapes, { phase: "BANQUE", libelle: "  Relancer la banque ", apresCode: "BA2", assigneA: marie, echeance: "2026-09-20" });
    etapes = ajouterEtapeAdHoc(etapes, { phase: "CLOTURE", libelle: "Bilan" });
    const x1 = etapes.find((e) => e.code === "X-1")!;
    expect(x1).toMatchObject({ libelle: "Relancer la banque", statut: "a_faire", adHoc: true, apresCode: "BA2", assigneA: marie, echeance: "2026-09-20" });
    expect(etapes.find((e) => e.code === "X-2")).toBeDefined();
    expect(etapes).toHaveLength(N + 2);
    // Suppression de X-1 : le prochain reste X-3 (jamais de reutilisation).
    etapes = etapes.filter((e) => e.code !== "X-1");
    expect(prochainCodeAdHoc(etapes)).toBe("X-3");
    etapes = ajouterEtapeAdHoc(etapes, { phase: "CADRAGE", libelle: "Encore" });
    expect(etapes.some((e) => e.code === "X-3")).toBe(true);
    expect(etapes.some((e) => e.code === "X-1")).toBe(false);
  });
});

describe("assignerParRole", () => {
  it("sans forcer : assigne d'apres le role uniquement les etapes libres", () => {
    const etapes = etapesParDefaut();
    etapes.find((e) => e.code === "CA1")!.assigneA = sekou; // gestionnaire mais deja pris par Sekou
    const r = assignerParRole(etapes, equipe);
    expect(r.find((e) => e.code === "CA1")!.assigneA).toEqual(sekou); // conserve
    expect(r.find((e) => e.code === "CA2")!.assigneA).toEqual(marie); // gestionnaire
    expect(r.find((e) => e.code === "CA6")!.assigneA).toEqual(sekou); // referent
    expect(r.find((e) => e.code === "BA2")!.assigneA).toBeUndefined(); // assistant absent de l'equipe
    // Pas de mutation de l'entree.
    expect(etapes.find((e) => e.code === "CA2")!.assigneA).toBeUndefined();
  });

  it("avec forcer : ecrase les assignations explicites des roles renseignes", () => {
    const etapes = etapesParDefaut();
    etapes.find((e) => e.code === "CA1")!.assigneA = sekou;
    etapes.find((e) => e.code === "BA2")!.assigneA = sekou; // assistant : pas dans l'equipe -> intact
    const r = assignerParRole(etapes, equipe, true);
    expect(r.find((e) => e.code === "CA1")!.assigneA).toEqual(marie);
    expect(r.find((e) => e.code === "BA2")!.assigneA).toEqual(sekou);
  });

  it("une etape ad hoc sans role n'est pas touchee", () => {
    const etapes = ajouterEtapeAdHoc(etapesParDefaut(), { phase: "BANQUE", libelle: "Ad hoc" });
    const r = assignerParRole(etapes, equipe, true);
    expect(r.find((e) => e.code === "X-1")!.assigneA).toBeUndefined();
  });
});

describe("avancement", () => {
  it("= part des etapes faites/ignorees ; 0 sans etape", () => {
    const d = creerDossier("S0303", "Test");
    expect(avancement(d)).toBe(0);
    d.etapes[0]!.statut = "fait";
    d.etapes[1]!.statut = "ignore";
    d.etapes[2]!.statut = "bloque";
    d.etapes[3]!.statut = "en_cours";
    expect(avancement(d)).toBeCloseTo(2 / N);
    expect(avancement({ ...d, etapes: [] })).toBe(0);
  });
});
