// Tests de la verification post-import : confrontation des cibles de calage aux soldes lus
// dans eStale (provider FAKE injecte - aucun reseau). Donnees synthetiques.
import { describe, expect, it } from "vitest";
import type { SoldeCompte } from "@/lib/reprise/domain/compta";
import type { EstaleComptaLectureProvider, RefAccounting } from "@/lib/reprise/ports/estale-compta-lecture-provider";
import { verifierSoldesApresImport } from "../verifier-import-compta";

function fake(comptes: SoldeCompte[], resolue = true): EstaleComptaLectureProvider {
  return {
    async resoudreAccounting(): Promise<RefAccounting | null> {
      return resolue ? { condoID: "c", accountingID: "a" } : null;
    },
    async lireBalanceGlobale(): Promise<number> {
      return 0;
    },
    async lireComptes(): Promise<SoldeCompte[]> {
      return comptes;
    },
  };
}

const compte = (nomenclature: string, solde: number): SoldeCompte => ({
  nomenclature,
  classe: Number(nomenclature[0]) as SoldeCompte["classe"],
  debit: solde > 0 ? solde : 0,
  credit: solde < 0 ? -solde : 0,
  solde,
});

describe("verifierSoldesApresImport", () => {
  it("conforme quand chaque compte cible retombe au centime", async () => {
    const provider = fake([compte("4500001", 310), compte("4500002", 180), compte("4719999", -110)]);
    const r = await verifierSoldesApresImport("S0303", { "4500001": 310, "4500002": 180, "4719999": -110 }, provider);
    expect(r).toMatchObject({ ok: true, conforme: true, nbControles: 3 });
    if (r.ok) expect(r.ecarts).toEqual([]);
  });

  it("liste les ECARTS compte par compte (jamais un verdict global muet)", async () => {
    const provider = fake([compte("4500001", 310), compte("4500002", 175.5)]);
    const r = await verifierSoldesApresImport("S0303", { "4500001": 310, "4500002": 180 }, provider);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.conforme).toBe(false);
    expect(r.ecarts).toEqual([{ compte: "4500002", attendu: 180, lu: 175.5, ecart: -4.5 }]);
  });

  it("un compte cible ABSENT du plan eStale est liste comme introuvable", async () => {
    const provider = fake([compte("4500001", 310)]);
    const r = await verifierSoldesApresImport("S0303", { "4500001": 310, "4719999": -110 }, provider);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.conforme).toBe(false);
    expect(r.comptesIntrouvables).toEqual(["4719999"]);
  });

  it("copro introuvable -> degradation propre { ok: false }", async () => {
    const r = await verifierSoldesApresImport("S0999", { "4500001": 1 }, fake([], false));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/introuvable/);
  });
});
