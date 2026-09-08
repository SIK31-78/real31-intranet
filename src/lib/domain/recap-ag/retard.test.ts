import { describe, it, expect } from "vitest";
import {
  agSurveillee,
  evaluerRecapAg,
  ANCIENNETE_MAX_JOURS,
  DEBUT_HISTORIQUE_RECAPS,
  DELAI_RECAP_JOURS,
  TOLERANCE_RAPPROCHEMENT_JOURS,
} from "./retard";

const AUJ = "2026-10-27";

describe("agSurveillee", () => {
  it("prend la prochaine AG si sa date est deja passee (cycle jamais conclu)", () => {
    expect(agSurveillee("2026-09-30", "2026-04-09", AUJ)).toEqual({
      date: "2026-09-30",
      origine: "prochaine",
    });
  });

  it("retombe sur la derniere AG tenue si la prochaine est encore devant", () => {
    expect(agSurveillee("2026-12-15", "2026-09-18", AUJ)).toEqual({
      date: "2026-09-18",
      origine: "derniere",
    });
  });

  it("une AG prevue AUJOURD'HUI n'est pas encore passee (le SQL compare en strict)", () => {
    expect(agSurveillee(AUJ, "2026-09-18", AUJ)).toEqual({
      date: "2026-09-18",
      origine: "derniere",
    });
  });

  it("prend la derniere AG quand il n'y a pas de prochaine date", () => {
    expect(agSurveillee(undefined, "2026-09-01", AUJ)).toEqual({
      date: "2026-09-01",
      origine: "derniere",
    });
  });

  it("ne surveille rien quand la copro n'a aucune date d'AG", () => {
    expect(agSurveillee(undefined, undefined, AUJ)).toBeUndefined();
  });
});

describe("evaluerRecapAg", () => {
  it("ne dit rien sans date d'AG", () => {
    expect(evaluerRecapAg(undefined, [], AUJ)).toEqual({ statut: "rien_a_signaler" });
  });

  it("ne dit rien pour une AG encore a venir", () => {
    expect(evaluerRecapAg("2026-12-15", [], AUJ)).toEqual({ statut: "rien_a_signaler" });
  });

  // --- La borne du delai de 7 jours -----------------------------------------

  it("ne dit rien a 7 jours pile : le delai court encore", () => {
    expect(evaluerRecapAg("2026-10-20", [], AUJ)).toEqual({ statut: "rien_a_signaler" });
  });

  it("passe en retard a 8 jours", () => {
    expect(evaluerRecapAg("2026-10-19", [], AUJ)).toEqual({
      statut: "en_retard",
      joursDeRetard: 8,
    });
  });

  it("compte les jours de retard depuis le jour de l'AG", () => {
    expect(evaluerRecapAg("2026-09-30", [], AUJ)).toEqual({
      statut: "en_retard",
      joursDeRetard: 27,
    });
  });

  // --- La tolerance de rapprochement ----------------------------------------

  it("un recap le jour meme couvre l'AG", () => {
    expect(evaluerRecapAg("2026-09-30", ["2026-09-30"], AUJ)).toEqual({ statut: "a_jour" });
  });

  it("un recap a +15 jours couvre encore l'AG", () => {
    expect(evaluerRecapAg("2026-09-05", ["2026-09-20"], AUJ)).toEqual({ statut: "a_jour" });
  });

  it("un recap a +16 jours ne couvre plus l'AG", () => {
    expect(evaluerRecapAg("2026-09-05", ["2026-09-21"], AUJ)).toEqual({
      statut: "en_retard",
      joursDeRetard: 52,
    });
  });

  it("un recap a -15 jours couvre l'AG (la tolerance joue des deux cotes)", () => {
    expect(evaluerRecapAg("2026-09-20", ["2026-09-05"], AUJ)).toEqual({ statut: "a_jour" });
  });

  it("un recap a -16 jours ne couvre plus l'AG", () => {
    expect(evaluerRecapAg("2026-09-21", ["2026-09-05"], AUJ)).toEqual({
      statut: "en_retard",
      joursDeRetard: 36,
    });
  });

  it("cherche le bon recap parmi plusieurs AG de la meme copro", () => {
    const recaps = ["2026-09-02", "2026-09-28"];
    expect(evaluerRecapAg("2026-09-30", recaps, AUJ)).toEqual({ statut: "a_jour" });
    expect(evaluerRecapAg("2026-10-15", recaps, AUJ)).toEqual({
      statut: "en_retard",
      joursDeRetard: 12,
    });
  });

  // --- Le seuil de debut du suivi (mise en service du module, 01/09/2026) ----

  it("ne dit rien pour une AG anterieure au debut du suivi", () => {
    expect(evaluerRecapAg("2026-08-31", [], AUJ)).toEqual({ statut: "rien_a_signaler" });
  });

  it("signale une AG au jour pile du debut du suivi", () => {
    expect(evaluerRecapAg(DEBUT_HISTORIQUE_RECAPS, [], AUJ)).toEqual({
      statut: "en_retard",
      joursDeRetard: 56,
    });
  });

  // --- La borne d'anciennete (decision Sekou : passe un an, la compta a fait le job) ---
  // Subsumee par le seuil du 01/09/2026 jusqu'au 01/09/2027 ; testee ici avec un
  // "aujourd'hui" au-dela pour verifier qu'elle redevient la borne active.

  it("signale encore une AG a 365 jours pile", () => {
    expect(evaluerRecapAg("2026-10-27", [], "2027-10-27")).toEqual({
      statut: "en_retard",
      joursDeRetard: 365,
    });
  });

  it("ne dit plus rien a 366 jours", () => {
    expect(evaluerRecapAg("2026-10-26", [], "2027-10-27")).toEqual({
      statut: "rien_a_signaler",
    });
  });

  it("un recap couvrant l'AG prime meme avant le seuil (c'est un FAIT, pas un silence)", () => {
    expect(evaluerRecapAg("2026-06-10", ["2026-06-12"], AUJ)).toEqual({ statut: "a_jour" });
  });
});

describe("constantes de la regle", () => {
  it("garde les valeurs decidees", () => {
    expect(DELAI_RECAP_JOURS).toBe(7);
    expect(TOLERANCE_RAPPROCHEMENT_JOURS).toBe(15);
    expect(DEBUT_HISTORIQUE_RECAPS).toBe("2026-09-01");
    expect(ANCIENNETE_MAX_JOURS).toBe(365);
  });
});
