import { describe, expect, it } from "vitest";
import { verifierBalanceCompta } from "../verifier-balance-compta";
import {
  MockEstaleComptaLectureProvider,
  comptesMock,
  CODE_COPRO_MOCK,
} from "@/lib/reprise/adapters/estale-compta/mock-provider";
import { construireBalance } from "@/lib/reprise/domain/compta";
import type {
  EstaleComptaLectureProvider,
  RefAccounting,
} from "@/lib/reprise/ports/estale-compta-lecture-provider";
import type { SoldeCompte } from "@/lib/reprise/domain/compta";

describe("verifierBalanceCompta - mock (copro de demonstration)", () => {
  it("resout, lit et construit une balance equilibree + coherente avec eStale", async () => {
    const r = await verifierBalanceCompta(CODE_COPRO_MOCK, new MockEstaleComptaLectureProvider());
    expect(r.ok).toBe(true);
    if (!r.ok) return; // narrowing
    expect(r.balance.equilibre).toBe(true);
    expect(r.balance.totalDebit).toBe(15000);
    expect(r.balance.totalCredit).toBe(15000);
    expect(r.balanceGlobaleEstale).toBe(0);
    expect(r.coherent).toBe(true);
  });

  it("le jeu du mock N'est PAS equilibre sur les seules classes 4/5/6 (bloc A+B)", () => {
    const sansClasse7 = comptesMock().filter((c) => c.classe !== 7);
    expect(construireBalance(sansClasse7).equilibre).toBe(false);
    // ...mais l'est avec la classe 7 (jeu complet).
    expect(construireBalance(comptesMock()).equilibre).toBe(true);
  });
});

describe("verifierBalanceCompta - degradation propre", () => {
  it("copro introuvable -> { ok:false, message }", async () => {
    const r = await verifierBalanceCompta("S0INCONNUE", new MockEstaleComptaLectureProvider());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/introuvable/i);
  });

  it("une panne du provider -> { ok:false, message } (pas d'exception qui remonte)", async () => {
    const providerEnPanne: EstaleComptaLectureProvider = {
      async resoudreAccounting(): Promise<RefAccounting | null> {
        return { condoID: "c", accountingID: "a" };
      },
      async lireComptes(): Promise<SoldeCompte[]> {
        throw new Error("eStale indisponible (HTTP 503)");
      },
      async lireBalanceGlobale(): Promise<number> {
        return 0;
      },
      async lireOwners() {
        return [];
      },
    };
    const r = await verifierBalanceCompta("S0302", providerEnPanne);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/impossible/i);
    expect(r.message).toMatch(/503/);
  });

  it("incoherence signalee quand eStale annonce equilibre mais nos comptes non", async () => {
    const providerIncoherent: EstaleComptaLectureProvider = {
      async resoudreAccounting(): Promise<RefAccounting | null> {
        return { condoID: "c", accountingID: "a" };
      },
      async lireComptes(): Promise<SoldeCompte[]> {
        // Desequilibre cote comptes (que du debit)...
        return [{ nomenclature: "6060000", classe: 6, debit: 4000, credit: 0, solde: 4000 }];
      },
      async lireBalanceGlobale(): Promise<number> {
        return 0; // ...alors qu'eStale annonce 0 (equilibre) -> incoherence
      },
      async lireOwners() {
        return [];
      },
    };
    const r = await verifierBalanceCompta("S0302", providerIncoherent);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.balance.equilibre).toBe(false);
    expect(r.coherent).toBe(false);
  });
});
