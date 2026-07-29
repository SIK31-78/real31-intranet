// Perimetre agence des comptables (Sekou 2026-07-29). Le point qui compte : un comptable
// SANS perimetre declare ne doit JAMAIS se retrouver avec tout le cabinet -- il facturerait
// des copros qui ne sont pas les siennes. Un ecran vide se voit et se signale.

import { describe, expect, it } from "vitest";
import {
  agencesDuComptable,
  aUnPerimetreComptable,
  filtrerSurPerimetreComptable,
} from "./perimetre-comptable";

const copros = [
  { code: "S100", agence: "ML" },
  { code: "S200", agence: "LGC" },
  { code: "S300", agence: "HLS" },
  { code: "S400", agence: "ASN" },
  { code: "S500", agence: undefined }, // agence non resolue
];
const filtrer = (email: string | null | undefined) =>
  filtrerSurPerimetreComptable(copros, email, (c) => c.agence).map((c) => c.code);

describe("perimetre comptable", () => {
  it("Isabelle tient Maisons-Laffitte", () => {
    expect(agencesDuComptable("isabelle.anglade@real31.fr")).toEqual(["ML"]);
    expect(filtrer("isabelle.anglade@real31.fr")).toEqual(["S100"]);
  });

  it("Romain et Elsa tiennent HLS, LGC et ASN", () => {
    for (const e of ["romain.gobert@real31.fr", "elsa.peixoto@real31.fr"]) {
      expect(agencesDuComptable(e)).toEqual(["HLS", "LGC", "ASN"]);
      expect(filtrer(e)).toEqual(["S200", "S300", "S400"]);
    }
  });

  it("est insensible a la casse de l'email (celui d'Entra peut differer)", () => {
    expect(agencesDuComptable("ISABELLE.Anglade@real31.fr")).toEqual(["ML"]);
  });

  it("n'ouvre RIEN a un email non affecte — surtout pas tout le cabinet", () => {
    expect(agencesDuComptable("inconnu@real31.fr")).toEqual([]);
    expect(aUnPerimetreComptable("inconnu@real31.fr")).toBe(false);
    expect(filtrer("inconnu@real31.fr")).toEqual([]);
    expect(filtrer(null)).toEqual([]);
    expect(filtrer("")).toEqual([]);
  });

  it("exclut une copro dont l'agence n'est pas resolue, au lieu de l'inclure par defaut", () => {
    expect(filtrer("elsa.peixoto@real31.fr")).not.toContain("S500");
  });

  it("ne laisse pas muter la liste fermee via le tableau renvoye", () => {
    const a = agencesDuComptable("isabelle.anglade@real31.fr");
    a.push("HLS");
    expect(agencesDuComptable("isabelle.anglade@real31.fr")).toEqual(["ML"]);
  });
});
