// Tests du plan de controles de dispo (OCCUPE = BLOQUANT, decision Sekou 2026-07).
// Le coeur du probleme est le FAUX POSITIF de replanification : notre propre evenement
// Outlook occupe deja le creneau -> getSchedule dirait "occupe" a cause de nous. Le plan
// (pur) decide quelles cibles controler reellement ; ces tests verrouillent la regle.

import { describe, expect, it } from "vitest";
import {
  planifierControlesDispo,
  type CreneauReservation,
} from "@/lib/domain/disponibilite-reunion";

const SALLE = "real31lgc@real31.fr";
const AUTRE_SALLE = "real31JF@real31.fr";
const COLLEGUE1 = "emmanuel@real31.fr";
const COLLEGUE2 = "dimitri@real31.fr";

const vide: CreneauReservation = { date: "", heure: "", salle: "", collaborateurs: [] };

describe("planifierControlesDispo - premiere pose (aucun creneau existant)", () => {
  it("tout est controle : agenda, salle choisie, tous les collegues", () => {
    const plan = planifierControlesDispo(vide, {
      date: "2026-09-15",
      heure: "18:00",
      salle: SALLE,
      collaborateurs: [COLLEGUE1, COLLEGUE2],
    });
    expect(plan.verifierAgenda).toBe(true);
    expect(plan.salleAverifier).toBe(SALLE);
    expect(plan.collaborateursAverifier).toEqual([COLLEGUE1, COLLEGUE2]);
  });

  it("sans salle choisie : pas de controle salle", () => {
    const plan = planifierControlesDispo(vide, {
      date: "2026-09-15",
      heure: "18:00",
      salle: "",
      collaborateurs: [],
    });
    expect(plan.salleAverifier).toBeNull();
    expect(plan.collaborateursAverifier).toEqual([]);
  });
});

describe("planifierControlesDispo - replanification, creneau INCHANGE (faux positif)", () => {
  const ancien: CreneauReservation = {
    date: "2026-09-15",
    heure: "18:00",
    salle: SALLE,
    collaborateurs: [COLLEGUE1],
  };

  it("meme date+heure+salle+collegues : RIEN n'est controle (tout 'occupe' viendrait de nous)", () => {
    const plan = planifierControlesDispo(ancien, { ...ancien, collaborateurs: [COLLEGUE1] });
    expect(plan.verifierAgenda).toBe(false);
    expect(plan.salleAverifier).toBeNull();
    expect(plan.collaborateursAverifier).toEqual([]);
  });

  it("ajouter un collegue a creneau inchange : SEUL le nouveau collegue est controle", () => {
    const plan = planifierControlesDispo(ancien, {
      ...ancien,
      collaborateurs: [COLLEGUE1, COLLEGUE2],
    });
    expect(plan.verifierAgenda).toBe(false); // mon evenement occupe deja mon agenda
    expect(plan.salleAverifier).toBeNull(); // la salle, c'est NOTRE reservation
    expect(plan.collaborateursAverifier).toEqual([COLLEGUE2]); // lui n'a pas encore l'invitation
  });

  it("changer de salle a creneau inchange : la NOUVELLE salle est controlee (pas l'agenda)", () => {
    const plan = planifierControlesDispo(ancien, { ...ancien, salle: AUTRE_SALLE });
    expect(plan.verifierAgenda).toBe(false);
    expect(plan.salleAverifier).toBe(AUTRE_SALLE);
  });

  it("la comparaison d'emails ignore casse et espaces (salle et collegues)", () => {
    const plan = planifierControlesDispo(ancien, {
      ...ancien,
      salle: " REAL31LGC@real31.fr ",
      collaborateurs: ["EMMANUEL@real31.fr"],
    });
    expect(plan.salleAverifier).toBeNull();
    expect(plan.collaborateursAverifier).toEqual([]);
  });
});

describe("planifierControlesDispo - le creneau BOUGE (controle reel)", () => {
  const ancien: CreneauReservation = {
    date: "2026-09-15",
    heure: "18:00",
    salle: SALLE,
    collaborateurs: [COLLEGUE1],
  };

  it("autre jour : tout est re-controle (agenda, salle, collegues deja invites compris)", () => {
    const plan = planifierControlesDispo(ancien, { ...ancien, date: "2026-10-01" });
    expect(plan.verifierAgenda).toBe(true);
    expect(plan.salleAverifier).toBe(SALLE);
    expect(plan.collaborateursAverifier).toEqual([COLLEGUE1]);
  });

  it("meme jour mais autre heure : creneau different -> tout est re-controle (limite assumee)", () => {
    const plan = planifierControlesDispo(ancien, { ...ancien, heure: "18:30" });
    expect(plan.verifierAgenda).toBe(true);
    expect(plan.salleAverifier).toBe(SALLE);
    expect(plan.collaborateursAverifier).toEqual([COLLEGUE1]);
  });

  it("ancien creneau sans heure (journee entiere) : pas d'evenement cadre -> tout est controle", () => {
    const plan = planifierControlesDispo(
      { date: "2026-09-15", heure: "", salle: "", collaborateurs: [] },
      { date: "2026-09-15", heure: "18:00", salle: SALLE, collaborateurs: [COLLEGUE1] },
    );
    expect(plan.verifierAgenda).toBe(true);
    expect(plan.salleAverifier).toBe(SALLE);
    expect(plan.collaborateursAverifier).toEqual([COLLEGUE1]);
  });
});
