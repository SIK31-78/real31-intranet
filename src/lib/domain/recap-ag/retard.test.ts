import { describe, it, expect } from "vitest";
import {
  agSurveillee,
  evaluerRecapAg,
  ANCIENNETE_MAX_JOURS,
  DEBUT_HISTORIQUE_RECAPS,
  DELAI_RECAP_JOURS,
  TOLERANCE_RAPPROCHEMENT_JOURS,
} from "./retard";

const AUJ = "2026-07-27";

describe("agSurveillee", () => {
  it("prend la prochaine AG si sa date est deja passee (cycle jamais conclu)", () => {
    expect(agSurveillee("2026-06-30", "2025-04-09", AUJ)).toEqual({
      date: "2026-06-30",
      origine: "prochaine",
    });
  });

  it("retombe sur la derniere AG tenue si la prochaine est encore devant", () => {
    expect(agSurveillee("2026-09-15", "2026-05-18", AUJ)).toEqual({
      date: "2026-05-18",
      origine: "derniere",
    });
  });

  it("une AG prevue AUJOURD'HUI n'est pas encore passee (le SQL compare en strict)", () => {
    expect(agSurveillee(AUJ, "2026-05-18", AUJ)).toEqual({
      date: "2026-05-18",
      origine: "derniere",
    });
  });

  it("prend la derniere AG quand il n'y a pas de prochaine date", () => {
    expect(agSurveillee(undefined, "2025-03-31", AUJ)).toEqual({
      date: "2025-03-31",
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
    expect(evaluerRecapAg("2026-09-15", [], AUJ)).toEqual({ statut: "rien_a_signaler" });
  });

  // --- La borne du delai de 7 jours -----------------------------------------

  it("ne dit rien a 7 jours pile : le delai court encore", () => {
    expect(evaluerRecapAg("2026-07-20", [], AUJ)).toEqual({ statut: "rien_a_signaler" });
  });

  it("passe en retard a 8 jours", () => {
    expect(evaluerRecapAg("2026-07-19", [], AUJ)).toEqual({
      statut: "en_retard",
      joursDeRetard: 8,
    });
  });

  it("compte les jours de retard depuis le jour de l'AG", () => {
    expect(evaluerRecapAg("2026-06-30", [], AUJ)).toEqual({
      statut: "en_retard",
      joursDeRetard: 27,
    });
  });

  // --- La tolerance de rapprochement ----------------------------------------

  it("un recap le jour meme couvre l'AG", () => {
    expect(evaluerRecapAg("2026-06-30", ["2026-06-30"], AUJ)).toEqual({ statut: "a_jour" });
  });

  it("un recap a +15 jours couvre encore l'AG", () => {
    expect(evaluerRecapAg("2026-06-01", ["2026-06-16"], AUJ)).toEqual({ statut: "a_jour" });
  });

  it("un recap a +16 jours ne couvre plus l'AG", () => {
    expect(evaluerRecapAg("2026-06-01", ["2026-06-17"], AUJ)).toEqual({
      statut: "en_retard",
      joursDeRetard: 56,
    });
  });

  it("un recap a -15 jours couvre l'AG (la tolerance joue des deux cotes)", () => {
    expect(evaluerRecapAg("2026-06-16", ["2026-06-01"], AUJ)).toEqual({ statut: "a_jour" });
  });

  it("un recap a -16 jours ne couvre plus l'AG", () => {
    expect(evaluerRecapAg("2026-06-17", ["2026-06-01"], AUJ)).toEqual({
      statut: "en_retard",
      joursDeRetard: 40,
    });
  });

  it("cherche le bon recap parmi plusieurs AG de la meme copro", () => {
    const recaps = ["2025-04-09", "2026-06-28"];
    expect(evaluerRecapAg("2026-06-30", recaps, AUJ)).toEqual({ statut: "a_jour" });
    expect(evaluerRecapAg("2026-02-09", recaps, AUJ)).toEqual({
      statut: "en_retard",
      joursDeRetard: 168,
    });
  });

  // --- Le seuil de debut d'historique ---------------------------------------

  it("ne dit rien pour une AG anterieure au debut de l'historique connu", () => {
    expect(evaluerRecapAg("2025-03-30", [], AUJ)).toEqual({ statut: "rien_a_signaler" });
  });

  // Le seuil d'historique ne se DECLENCHE plus depuis l'ajout de la borne d'anciennete :
  // 2025-03-31 est desormais toujours au-dela d'un an. Il reste en place comme filet si
  // ANCIENNETE_MAX_JOURS remontait un jour -- ce test verrouille cette subsomption, pour
  // qu'on ne croie pas le seuil actif alors qu'il ne l'est plus.
  it("une AG au jour pile du debut de l'historique est desormais tue par la borne d'anciennete", () => {
    expect(evaluerRecapAg(DEBUT_HISTORIQUE_RECAPS, [], AUJ)).toEqual({
      statut: "rien_a_signaler",
    });
  });

  // --- La borne d'anciennete (decision Sekou : passe un an, la compta a fait le job) ---

  it("signale encore une AG a 365 jours pile", () => {
    expect(evaluerRecapAg("2025-07-27", [], AUJ)).toEqual({
      statut: "en_retard",
      joursDeRetard: 365,
    });
  });

  it("ne dit plus rien a 366 jours", () => {
    expect(evaluerRecapAg("2025-07-26", [], AUJ)).toEqual({ statut: "rien_a_signaler" });
  });

  it("un recap couvrant l'AG prime meme au-dela d'un an (c'est un FAIT, pas un silence)", () => {
    expect(evaluerRecapAg("2024-06-10", ["2024-06-12"], AUJ)).toEqual({ statut: "a_jour" });
  });

  it("dit quand meme 'a jour' avant le seuil si un recap couvre l'AG", () => {
    expect(evaluerRecapAg("2025-01-15", ["2025-01-15"], AUJ)).toEqual({ statut: "a_jour" });
  });
});

describe("constantes de la regle", () => {
  it("garde les valeurs calibrees sur la vraie data", () => {
    expect(DELAI_RECAP_JOURS).toBe(7);
    expect(TOLERANCE_RAPPROCHEMENT_JOURS).toBe(15);
    expect(DEBUT_HISTORIQUE_RECAPS).toBe("2025-03-31");
    expect(ANCIENNETE_MAX_JOURS).toBe(365);
  });
});
