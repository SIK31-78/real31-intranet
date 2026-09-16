import { describe, expect, it } from "vitest";
import type { ContratCopro, FacturationRepository } from "@/lib/ports/facturation-repository";
import { exigerTarifTtc, resoudreContexteTarifaire } from "./bareme";

// Le point de passage de TOUTE la facturation : « tarif figé au contrat sinon barème de
// l'année, sinon erreur ». Aucun test direct avant l'audit du 16/09/2026.

function repo(contrat: Partial<ContratCopro> | null, bareme: Record<string, number> = {}): FacturationRepository {
  return {
    async getDernierContrat() {
      return contrat ? ({ coproCode: "S001", debutContrat: "2026-07-01", ...contrat } as ContratCopro) : null;
    },
    async getTarifTtc(id: string) {
      return id in bareme ? bareme[id]! : null;
    },
  } as unknown as FacturationRepository;
}

describe("resoudreContexteTarifaire", () => {
  it("l'annee du bareme = l'annee de debut du dernier contrat, avec les tarifs figes s'il y en a", async () => {
    expect(await resoudreContexteTarifaire(repo({ debutContrat: "2025-07-01" }), "S001")).toEqual({ anneeBareme: 2025 });
    expect(await resoudreContexteTarifaire(repo({ tarifs: { MED: 45 } }), "S001")).toEqual({ anneeBareme: 2026, tarifsContrat: { MED: 45 } });
    // Une photo vide ne compte pas comme une photo.
    expect(await resoudreContexteTarifaire(repo({ tarifs: {} }), "S001")).toEqual({ anneeBareme: 2026 });
  });
  it("sans contrat : erreur explicite, pas de bareme devine", async () => {
    await expect(resoudreContexteTarifaire(repo(null), "SE999")).rejects.toThrow(/Aucun contrat de gestion pour la copropriété SE999/);
  });
});

describe("exigerTarifTtc", () => {
  it("prefere le tarif fige au contrat, sans lire le bareme", async () => {
    const r = repo(null, { MED: 60 });
    expect(await exigerTarifTtc(r, "MED", { anneeBareme: 2026, tarifsContrat: { MED: 45 } })).toBe(45);
  });
  it("bascule sur le bareme si la prestation n'est pas figee", async () => {
    const r = repo(null, { MED: 60 });
    expect(await exigerTarifTtc(r, "MED", { anneeBareme: 2026, tarifsContrat: { AGE: 300 } })).toBe(60);
    expect(await exigerTarifTtc(r, "MED", { anneeBareme: 2026 })).toBe(60);
  });
  it("leve si absent des deux (jamais un 0 silencieux comme PowerApps)", async () => {
    await expect(exigerTarifTtc(repo(null), "MED", { anneeBareme: 2024 })).rejects.toThrow('Tarif "MED" absent du bareme 2024.');
  });
  it("accepte encore un simple numero d'annee (regle historique)", async () => {
    expect(await exigerTarifTtc(repo(null, { TauxHoraire: 96 }), "TauxHoraire", 2026)).toBe(96);
  });
  it("un tarif fige illisible (NaN) ne masque pas le bareme", async () => {
    expect(await exigerTarifTtc(repo(null, { MED: 60 }), "MED", { anneeBareme: 2026, tarifsContrat: { MED: Number.NaN } })).toBe(60);
  });
});
