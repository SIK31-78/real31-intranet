import { describe, expect, it } from "vitest";
import { correspond, debutPeriode, filtrerHistorique } from "./filtre-historique";

const maintenant = new Date("2026-09-28T12:00:00Z");
const factures = [
  { id: "1", creeLe: "2026-09-20T10:00:00Z", corpus: "S104 Les Marronniers Dépassement AG SK Dépassement AG du 10/09/2026" },
  { id: "2", creeLe: "2026-07-01T10:00:00Z", corpus: "S067 Résidence Nationale État daté LB État daté lot 12" },
  { id: "3", creeLe: "2025-06-01T10:00:00Z", corpus: "S104 Les Marronniers Gestion courante SK Gestion T2" },
];

describe("filtre de l'historique des facturations", () => {
  it("recherche sans accents ni casse, tous les mots requis", () => {
    expect(correspond("Résidence Nationale État daté", "etat NATIONALE")).toBe(true);
    expect(correspond("Résidence Nationale État daté", "etat foch")).toBe(false);
    expect(correspond("n'importe quoi", "   ")).toBe(true);
  });

  it("combine recherche et periode", () => {
    const f = (recherche: string, periode: "30j" | "3m" | "12m" | "tout") =>
      filtrerHistorique(factures, (x) => x.corpus, { recherche, periode }, maintenant).map((x) => x.id);
    expect(f("", "tout")).toEqual(["1", "2", "3"]);
    expect(f("", "30j")).toEqual(["1"]);
    expect(f("", "3m")).toEqual(["1", "2"]);
    expect(f("marronniers", "tout")).toEqual(["1", "3"]);
    expect(f("marronniers", "12m")).toEqual(["1"]);
    expect(f("sk gestion", "tout")).toEqual(["3"]);
  });

  it("'tout' n'a pas de borne", () => {
    expect(debutPeriode("tout", maintenant)).toBeNull();
  });
});
