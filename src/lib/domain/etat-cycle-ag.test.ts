import { describe, it, expect } from "vitest";
import type { Copropriete } from "@/lib/domain/copropriete";
import { etatCycleAg } from "./etat-cycle-ag";

// Fabrique une copro minimale (les champs non utilises par l'etat sont caste-ignores).
function copro(p: Partial<Copropriete>): Copropriete {
  return {
    code: "S001",
    source: "crypto",
    nom: "Test",
    adresse: { ligne1: "", codePostal: "", ville: "" },
    statut: "active",
    lotsPrincipaux: 0,
    lotsAutres: 0,
    exercice: { debut: "01/01", fin: "31/12" },
    priseEnGestion: "-",
    equipe: [],
    ...p,
  } as Copropriete;
}

describe("etatCycleAg", () => {
  it("sans prochaine AG, delai legal a venir -> a_planifier non en retard", () => {
    const r = etatCycleAg(copro({}), false, "2026-06-22");
    expect(r.etat).toBe("a_planifier");
    expect(r.enRetard).toBe(false); // cloture 31/12 + 6 mois = 30/06 > 22/06
  });

  it("sans prochaine AG, delai legal depasse -> a_planifier EN RETARD", () => {
    const r = etatCycleAg(copro({}), false, "2026-08-01");
    expect(r.etat).toBe("a_planifier");
    expect(r.enRetard).toBe(true); // 30/06 < 01/08
  });

  it("AG proche (dans la fenetre), convoc non marquee -> en_preparation", () => {
    const r = etatCycleAg(copro({ prochaineAg: { date: "2026-06-30", statut: "planifiee" } }), false, "2026-06-22");
    expect(r.etat).toBe("en_preparation");
  });

  it("AG lointaine (au-dela de la fenetre, ex placeholder 31/12) -> a_venir", () => {
    const r = etatCycleAg(copro({ prochaineAg: { date: "2026-12-31", statut: "planifiee" } }), false, "2026-06-22");
    expect(r.etat).toBe("a_venir");
  });

  it("AG future, convoc marquee -> convoquee", () => {
    const r = etatCycleAg(copro({ prochaineAg: { date: "2026-06-30", statut: "planifiee" } }), true, "2026-06-22");
    expect(r.etat).toBe("convoquee");
  });

  it("AG passee -> tenue", () => {
    const r = etatCycleAg(copro({ prochaineAg: { date: "2026-06-10", statut: "planifiee" } }), false, "2026-06-22");
    expect(r.etat).toBe("tenue");
  });
});

describe("AG deja tenue pour l'exercice courant (bug Sekou 2026-07-17)", () => {
  // Exercice clos au 31/12 ; AG tenue le 16/04/2026 puis CONCLUE (prochaine date videe).
  // Avant le fix : la copro retombait dans "A planifier" alors qu'il n'y a rien a planifier
  // avant la cloture du 31/12/2026 (Remi voyait des AG deja tenues dans sa colonne).
  const conclue = { derniereAgDate: "2026-04-16", exercice: { debut: "01/01", fin: "31/12" } };

  it("n'est PAS a planifier : l'AG de l'exercice a eu lieu -> suivi post-AG", () => {
    const r = etatCycleAg(copro(conclue), false, "2026-07-17");
    expect(r.etat).toBe("tenue");
    expect(r.enRetard).toBe(false);
  });

  it("redevient a planifier une fois l'exercice suivant clos", () => {
    // En 2027 la cloture la plus recente est le 31/12/2026, POSTERIEURE a l'AG d'avril 2026.
    expect(etatCycleAg(copro(conclue), false, "2027-02-01").etat).toBe("a_planifier");
  });

  it("reste a planifier si l'AG de l'exercice n'a pas encore eu lieu", () => {
    const pasEncore = { ...conclue, derniereAgDate: "2025-04-16" };
    expect(etatCycleAg(copro(pasEncore), false, "2026-07-17").etat).toBe("a_planifier");
  });
});
