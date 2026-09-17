// Le noyau « suivi d'etapes » est partage par la perte et la reprise : ces tests verrouillent
// les regles communes (etape close, retard, avancement, etape courante / prochaine) et la
// lecture des anciens statuts persistes.

import { describe, expect, it } from "vitest";
import {
  avancement,
  compterParStatut,
  echeanceDepassee,
  etapeClose,
  etapeCourante,
  normaliserStatut,
  prochaineEtape,
  STATUTS_ETAPE,
  type StatutEtape,
} from "./etape";

type Ex = { code?: string | number; retard?: number; echeance?: string | null };
const e = (statut: StatutEtape, extra: Ex = {}) => ({ statut, ...extra });

describe("statut d'une etape", () => {
  it("fait et ignore sont clos, les trois autres restent ouverts", () => {
    expect(STATUTS_ETAPE.filter(etapeClose)).toEqual(["fait", "ignore"]);
  });

  it("lit l'ancien sans_objet de la perte comme ignore, garde les statuts connus, a_faire sinon", () => {
    expect(normaliserStatut("sans_objet")).toBe("ignore");
    for (const s of STATUTS_ETAPE) expect(normaliserStatut(s)).toBe(s);
    expect(normaliserStatut("n_importe_quoi")).toBe("a_faire");
  });
});

describe("echeanceDepassee", () => {
  it("strictement avant aujourd'hui, sur une etape ouverte seulement", () => {
    expect(echeanceDepassee(e("a_faire", { echeance: "2026-09-08" }), "2026-09-09")).toBe(true);
    expect(echeanceDepassee(e("bloque", { echeance: "2026-09-08" }), "2026-09-09T14:00:00Z")).toBe(true);
    expect(echeanceDepassee(e("a_faire", { echeance: "2026-09-09" }), "2026-09-09")).toBe(false);
    expect(echeanceDepassee(e("fait", { echeance: "2026-09-01" }), "2026-09-09")).toBe(false);
    expect(echeanceDepassee(e("ignore", { echeance: "2026-09-01" }), "2026-09-09")).toBe(false);
    expect(echeanceDepassee(e("a_faire"), "2026-09-09")).toBe(false);
    expect(echeanceDepassee(e("a_faire", { echeance: null }), "2026-09-09")).toBe(false);
  });
});

describe("avancement et compteurs", () => {
  const etapes = [e("fait"), e("ignore"), e("bloque"), e("en_cours"), e("a_faire"), e("fait")];

  it("compte les closes (ignore compris) sur le total", () => {
    expect(avancement(etapes)).toEqual({ faites: 3, total: 6 });
    expect(avancement([])).toEqual({ faites: 0, total: 0 });
  });

  it("compte par statut, toutes les cles presentes", () => {
    expect(compterParStatut(etapes)).toEqual({ a_faire: 1, en_cours: 1, bloque: 1, fait: 2, ignore: 1 });
    expect(compterParStatut([])).toEqual({ a_faire: 0, en_cours: 0, bloque: 0, fait: 0, ignore: 0 });
  });
});

describe("etapeCourante", () => {
  it("la premiere bloquee, sinon la premiere en cours, sinon la premiere a faire", () => {
    const liste = [e("fait", { code: 1 }), e("a_faire", { code: 2 }), e("en_cours", { code: 3 }), e("bloque", { code: 4 })];
    expect(etapeCourante(liste)?.code).toBe(4);
    expect(etapeCourante(liste.filter((x) => x.statut !== "bloque"))?.code).toBe(3);
    expect(etapeCourante(liste.filter((x) => x.statut === "a_faire" || x.statut === "fait"))?.code).toBe(2);
  });

  it("undefined quand tout est clos", () => {
    expect(etapeCourante([e("fait"), e("ignore")])).toBeUndefined();
    expect(etapeCourante([])).toBeUndefined();
  });
});

describe("prochaineEtape", () => {
  const retard = (x: Ex) => x.retard ?? null;

  it("la plus en retard d'abord, sinon la premiere ouverte dans l'ordre", () => {
    const liste = [
      e("fait", { code: "A", retard: 90 }),
      e("a_faire", { code: "B", retard: 3 }),
      e("en_cours", { code: "C", retard: 10 }),
      e("a_faire", { code: "D" }),
    ];
    expect(prochaineEtape(liste, retard)?.code).toBe("C");
    expect(prochaineEtape([e("fait"), e("bloque", { code: "X" }), e("a_faire", { code: "Y" })], retard)?.code).toBe("X");
  });

  it("null quand tout est clos ; un retard de 0 jour compte comme un retard", () => {
    expect(prochaineEtape([e("fait"), e("ignore")], retard)).toBeNull();
    expect(prochaineEtape([e("a_faire", { code: "P" }), e("a_faire", { code: "Q", retard: 0 })], retard)?.code).toBe("Q");
  });
});
