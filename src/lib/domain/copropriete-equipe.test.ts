import { describe, expect, it } from "vitest";
import { regrouperEquipeParPersonne, type MembreEquipe } from "./copropriete";

describe("regrouperEquipeParPersonne", () => {
  it("une personne qui tient deux roles n'apparait qu'une fois, roles fusionnes", () => {
    const equipe: MembreEquipe[] = [
      { initiales: "FS", nomComplet: "Fanny SORIVELLE", role: "gestionnaire" },
      { initiales: "FS", nomComplet: "Fanny SORIVELLE", role: "assistant" },
      { initiales: "EL", nomComplet: "Elsa LEROY", role: "comptable" },
    ];
    expect(regrouperEquipeParPersonne(equipe)).toEqual([
      { initiales: "FS", nomComplet: "Fanny SORIVELLE", roles: ["gestionnaire", "assistant"] },
      { initiales: "EL", nomComplet: "Elsa LEROY", roles: ["comptable"] },
    ]);
  });
  it("rapproche les noms sans casse ni accents, sans doubler un role", () => {
    const equipe: MembreEquipe[] = [
      { initiales: "PL", nomComplet: "Phoebé Lajus", role: "assistant" },
      { initiales: "PL", nomComplet: "PHOEBE  LAJUS", role: "assistant" },
      { initiales: "PL", nomComplet: "phoebe lajus", role: "comptable" },
    ];
    expect(regrouperEquipeParPersonne(equipe)).toEqual([{ initiales: "PL", nomComplet: "Phoebé Lajus", roles: ["assistant", "comptable"] }]);
  });
  it("equipe vide", () => {
    expect(regrouperEquipeParPersonne([])).toEqual([]);
  });
});
