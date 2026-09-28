import { describe, expect, it } from "vitest";
import { contratEnSaisie, debutContratRequis, erreurContratVote, MESSAGE_DEBUT_CONTRAT_REQUIS } from "./contrat-vote";

describe("contrat vote en AG : debut requis des que des honoraires sont saisis", () => {
  it("honoraires > 0 sans debut : bloquant", () => {
    expect(erreurContratVote({ honorairesGestionTtc: 2400 })).toBe(MESSAGE_DEBUT_CONTRAT_REQUIS);
    expect(erreurContratVote({ honorairesGestionTtc: 2400, debutContrat: "  " })).toBe(MESSAGE_DEBUT_CONTRAT_REQUIS);
  });

  it("honoraires > 0 avec debut : conforme", () => {
    expect(erreurContratVote({ honorairesGestionTtc: 2400, debutContrat: "2026-07-01" })).toBeNull();
  });

  it("forfait postal > 0 sans debut : bloquant aussi", () => {
    expect(erreurContratVote({ forfaitPostauxTtc: 235 })).toBe(MESSAGE_DEBUT_CONTRAT_REQUIS);
    expect(erreurContratVote({ forfaitPostauxTtc: 235, debutContrat: "2026-07-01" })).toBeNull();
  });

  it("contrat en saisie : honoraires ou debut, pas le seul forfait par defaut", () => {
    expect(contratEnSaisie({})).toBe(false);
    expect(contratEnSaisie({ honorairesGestionTtc: 2400 })).toBe(true);
    expect(contratEnSaisie({ debutContrat: "2026-07-01" })).toBe(true);
  });

  it("pas d'honoraires, ou 0 : rien a exiger", () => {
    expect(debutContratRequis({})).toBe(false);
    expect(debutContratRequis({ honorairesGestionTtc: 0 })).toBe(false);
    expect(erreurContratVote({})).toBeNull();
  });
});
