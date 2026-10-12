// Perimetre agence des comptables (Sekou 2026-07-29). Le point qui compte : un comptable
// SANS perimetre declare ne doit JAMAIS se retrouver avec tout le cabinet -- il facturerait
// des copros qui ne sont pas les siennes. Un ecran vide se voit et se signale.

import { describe, expect, it } from "vitest";
import {
  agencesDuComptable,
  aUnPerimetreComptable,
  filtrerSurAgences,
  filtrerSurPerimetreComptable, comptablesPourAgence, perimetreComptableEtendu } from "./perimetre-comptable";
import type { Delegation } from "./perimetre-ecriture";

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
  it("dans l'autre sens : qui ecrire pour une agence", () => {
    expect(comptablesPourAgence("ML")).toEqual(["isabelle.anglade@real31.fr"]);
    expect(comptablesPourAgence("HLS").sort()).toEqual(["elsa.peixoto@real31.fr", "romain.gobert@real31.fr"]);
    expect(comptablesPourAgence(undefined)).toEqual([]);
    expect(comptablesPourAgence("XX")).toEqual([]);
  });

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

describe("perimetre comptable elargi par delegation (REA-158)", () => {
  const ISABELLE = "isabelle.anglade@real31.fr";
  const emails: Record<string, string> = { romain: "romain.gobert@real31.fr", delphine: "delphine@real31.fr" };
  const emailDe = (id: string) => emails[id];
  const AUJ = "2026-10-12";
  const delegation = (extra: Partial<Delegation>): Delegation => ({
    id: "d1",
    deUserId: "romain",
    aUserId: "isabelle",
    portee: "portefeuille",
    depuisISO: "2026-10-01",
    jusquaISO: "2026-10-31",
    ...extra,
  });

  it("sans delegation : ses agences, rien de plus", () => {
    expect(perimetreComptableEtendu(ISABELLE, [], emailDe, AUJ)).toEqual({ agences: ["ML"], parDelegation: [] });
  });

  it("delegation d'une agence, active : l'agence s'ajoute et se signale", () => {
    const p = perimetreComptableEtendu(ISABELLE, [delegation({ portee: "agence", agenceCode: "lgc" })], emailDe, AUJ);
    expect(p).toEqual({ agences: ["ML", "LGC"], parDelegation: ["LGC"] });
  });

  it("portefeuille d'une COMPTABLE (conges de Romain) : ses agences s'ajoutent", () => {
    const p = perimetreComptableEtendu(ISABELLE, [delegation({})], emailDe, AUJ);
    expect(p).toEqual({ agences: ["ML", "LGC", "HLS", "ASN"], parDelegation: ["LGC", "HLS", "ASN"] });
  });

  it("portefeuille d'un GESTIONNAIRE ou une seule copro : aucune agence (ca passe par le perimetre d'ecriture)", () => {
    const p = perimetreComptableEtendu(
      ISABELLE,
      [delegation({ deUserId: "delphine" }), delegation({ id: "d2", portee: "copro", coproCode: "S215" })],
      emailDe,
      AUJ,
    );
    expect(p).toEqual({ agences: ["ML"], parDelegation: [] });
  });

  it("delegation expiree ou a venir : ignoree, le perimetre revient seul", () => {
    expect(perimetreComptableEtendu(ISABELLE, [delegation({ jusquaISO: "2026-10-11" })], emailDe, AUJ).agences).toEqual(["ML"]);
    expect(perimetreComptableEtendu(ISABELLE, [delegation({ depuisISO: "2026-10-13" })], emailDe, AUJ).agences).toEqual(["ML"]);
  });

  it("agence inconnue : ignoree, jamais tout le cabinet", () => {
    expect(perimetreComptableEtendu(ISABELLE, [delegation({ portee: "agence", agenceCode: "XX" })], emailDe, AUJ).agences).toEqual(["ML"]);
  });

  it("une non-comptable qui recoit l'agence d'une comptable : le perimetre delegue seul", () => {
    expect(perimetreComptableEtendu("autre@real31.fr", [delegation({ portee: "agence", agenceCode: "ML" })], emailDe, AUJ)).toEqual({
      agences: ["ML"],
      parDelegation: ["ML"],
    });
  });

  it("filtrerSurAgences : liste vide -> rien, agence non resolue -> exclue", () => {
    expect(filtrerSurAgences(copros, [], (c) => c.agence)).toEqual([]);
    expect(filtrerSurAgences(copros, ["ML", "LGC"], (c) => c.agence).map((c) => c.code)).toEqual(["S100", "S200"]);
  });
});
