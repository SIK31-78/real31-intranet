// Tests du composite copro : union miroir + eStale, dedup, cloisonnement, routage des
// dates (eStale -> table intranet ; Crypto -> miroir) et DEGRADATION (eStale KO -> miroir
// seul, jamais de plantage). Les ports sont des fakes en memoire : zero reseau, zero DB.

import { describe, it, expect, vi } from "vitest";
import type { CoproRepository } from "@/lib/ports/copro-repository";
import type { CoproEstaleProvider } from "@/lib/ports/copro-estale-provider";
import type { CoproDatesRepository } from "@/lib/ports/copro-dates-repository";
import type { Copropriete } from "@/lib/domain/copropriete";
import { CompositeCoproRepository } from "./composite-copro-repository";

function copro(p: Partial<Copropriete> & { code: string }): Copropriete {
  return {
    source: "crypto",
    nom: "Test",
    adresse: { ligne1: "1 rue", codePostal: "31000", ville: "Toulouse" },
    statut: "active",
    lotsPrincipaux: 0,
    lotsAutres: 0,
    exercice: { debut: "-", fin: "-" },
    priseEnGestion: "-",
    equipe: [],
    ...p,
  };
}

// --- Fakes -------------------------------------------------------------------

class FakeMiroir implements CoproRepository {
  setAppels: { code: string; type: string; quand: string; dateISO: string | null; managerId: string }[] = [];
  constructor(private readonly rows: Copropriete[]) {}
  async list(managerId?: string): Promise<Copropriete[]> {
    const actives = this.rows.filter((c) => c.statut === "active");
    if (!managerId) return actives;
    return actives.filter((c) => c.managerId === managerId || c.assistantId === managerId);
  }
  async listerToutes(): Promise<Copropriete[]> {
    return this.rows.filter((c) => c.statut === "active");
  }
  async findByCode(code: string, managerId?: string): Promise<Copropriete | null> {
    const c = this.rows.find((r) => r.code === code) ?? null;
    if (!c) return null;
    if (managerId && c.managerId !== managerId && c.assistantId !== managerId) return null;
    return c;
  }
  async setDateEvenement(code: string, type: "ag" | "cs", quand: "prochaine" | "derniere", dateISO: string | null, managerId: string) {
    this.setAppels.push({ code, type, quand, dateISO, managerId });
  }
}

class FakeEstale implements CoproEstaleProvider {
  constructor(private readonly rows: Copropriete[], private readonly ko = false) {}
  async listerCoprosEstale(): Promise<Copropriete[]> {
    if (this.ko) throw new Error("eStale injoignable");
    return this.rows.map((c) => ({ ...c }));
  }
  async getCoproEstale(code: string): Promise<Copropriete | null> {
    if (this.ko) throw new Error("eStale injoignable");
    return this.rows.find((c) => c.code === code) ?? null;
  }
}

class FakeDates implements CoproDatesRepository {
  ecritures: { code: string; type: string; quand: string; dateISO: string | null }[] = [];
  constructor(private readonly map = new Map<string, import("@/lib/domain/copro-fusion").CoproDates>()) {}
  async lire(code: string) {
    return this.map.get(code) ?? null;
  }
  async lireToutes() {
    return new Map(this.map);
  }
  async ecrire(code: string, type: "ag" | "cs", quand: "prochaine" | "derniere", dateISO: string | null) {
    this.ecritures.push({ code, type, quand, dateISO });
  }
}

// Jeu commun : 2 Crypto, 1 copro eStale mirroree (S300, avec date miroir), 1 orpheline (S297).
const miroirRows = [
  copro({ code: "S104", source: "crypto", managerId: "u1" }),
  copro({ code: "S088", source: "crypto", managerId: "u2" }),
  copro({ code: "S300", source: "estale", managerId: "u-old", prochaineAg: { date: "2027-06-30", statut: "planifiee" }, derniereAgDate: "2026-04-02" }),
];
const estaleRows = [
  copro({ code: "S300", source: "estale", nom: "BEZONS71CA", managerId: "u-mahaut", agenceId: "ag-hls" }),
  copro({ code: "S297", source: "estale", nom: "Les Pleiades" }), // orpheline, pas de managerId
];

describe("CompositeCoproRepository.list", () => {
  it("union miroir + eStale, dedup S300 (version eStale), orpheline S297 visible", async () => {
    const c = new CompositeCoproRepository(new FakeMiroir(miroirRows), new FakeEstale(estaleRows), new FakeDates());
    const res = await c.list();
    const codes = res.map((x) => x.code).sort();
    expect(codes).toEqual(["S088", "S104", "S297", "S300"]);
    const s300 = res.filter((x) => x.code === "S300");
    expect(s300).toHaveLength(1);
    expect(s300[0].nom).toBe("BEZONS71CA"); // vient d'eStale
    expect(s300[0].managerId).toBe("u-mahaut");
  });

  it("date d'AG d'une copro eStale : repli miroir si intranet vide", async () => {
    const c = new CompositeCoproRepository(new FakeMiroir(miroirRows), new FakeEstale(estaleRows), new FakeDates());
    const s300 = (await c.list()).find((x) => x.code === "S300")!;
    expect(s300.prochaineAg?.date).toBe("2027-06-30"); // repli sur la ligne miroir
    expect(s300.derniereAgDate).toBe("2026-04-02");
  });

  it("date intranet PRIORITAIRE sur le repli miroir", async () => {
    const dates = new FakeDates(new Map([["S300", { prochaineAgDate: "2026-11-15", prochaineAgHeure: "18:00" }]]));
    const c = new CompositeCoproRepository(new FakeMiroir(miroirRows), new FakeEstale(estaleRows), dates);
    const s300 = (await c.list()).find((x) => x.code === "S300")!;
    expect(s300.prochaineAg).toEqual({ date: "2026-11-15", heure: "18:00", statut: "planifiee", supervisionId: "S300__2026-11-15" });
  });

  it("DEGRADATION : eStale KO -> miroir SEUL (garde S300 mirroree, perd l'orpheline)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = new CompositeCoproRepository(new FakeMiroir(miroirRows), new FakeEstale(estaleRows, true), new FakeDates());
    const res = await c.list();
    expect(res.map((x) => x.code).sort()).toEqual(["S088", "S104", "S300"]); // S297 orpheline absente
    expect(res.find((x) => x.code === "S300")?.nom).toBe("Test"); // version miroir
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("cloisonnement managerId : eStale filtre en code, Crypto filtre par le miroir", async () => {
    const c = new CompositeCoproRepository(new FakeMiroir(miroirRows), new FakeEstale(estaleRows), new FakeDates());
    const res = await c.list("u-mahaut");
    // u-mahaut ne gere aucune Crypto ici, mais gere S300 (eStale). Repli dates miroir non
    // cloisonne -> S300 garde sa date malgre le scope.
    expect(res.map((x) => x.code)).toEqual(["S300"]);
    expect(res[0].prochaineAg?.date).toBe("2027-06-30");
  });
});

describe("CompositeCoproRepository.findByCode (routage)", () => {
  it("code eStale -> provider eStale, dates completees", async () => {
    const c = new CompositeCoproRepository(new FakeMiroir(miroirRows), new FakeEstale(estaleRows), new FakeDates());
    const s300 = await c.findByCode("S300");
    expect(s300?.nom).toBe("BEZONS71CA");
    expect(s300?.prochaineAg?.date).toBe("2027-06-30");
  });

  it("code Crypto -> miroir", async () => {
    const c = new CompositeCoproRepository(new FakeMiroir(miroirRows), new FakeEstale(estaleRows), new FakeDates());
    expect((await c.findByCode("S104"))?.source).toBe("crypto");
  });

  it("cloisonnement : copro eStale hors scope -> null", async () => {
    const c = new CompositeCoproRepository(new FakeMiroir(miroirRows), new FakeEstale(estaleRows), new FakeDates());
    expect(await c.findByCode("S300", "u-autre")).toBeNull();
    expect((await c.findByCode("S300", "u-mahaut"))?.code).toBe("S300");
  });

  it("DEGRADATION : eStale KO -> findByCode retombe sur le miroir", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = new CompositeCoproRepository(new FakeMiroir(miroirRows), new FakeEstale(estaleRows, true), new FakeDates());
    expect((await c.findByCode("S300"))?.nom).toBe("Test"); // version miroir
    expect(await c.findByCode("S297")).toBeNull(); // orpheline introuvable sans eStale
    warn.mockRestore();
  });
});

describe("CompositeCoproRepository.setDateEvenement (routage)", () => {
  it("copro eStale -> ecrit dans la table intranet, PAS dans le miroir", async () => {
    const miroir = new FakeMiroir(miroirRows);
    const dates = new FakeDates();
    const c = new CompositeCoproRepository(miroir, new FakeEstale(estaleRows), dates);
    await c.setDateEvenement("S300", "ag", "prochaine", "2026-12-01", "u-mahaut");
    expect(dates.ecritures).toEqual([{ code: "S300", type: "ag", quand: "prochaine", dateISO: "2026-12-01" }]);
    expect(miroir.setAppels).toHaveLength(0);
  });

  it("copro eStale hors scope -> no-op (comme le miroir)", async () => {
    const dates = new FakeDates();
    const c = new CompositeCoproRepository(new FakeMiroir(miroirRows), new FakeEstale(estaleRows), dates);
    await c.setDateEvenement("S300", "ag", "prochaine", "2026-12-01", "u-autre");
    expect(dates.ecritures).toHaveLength(0);
  });

  it("copro Crypto -> delegue au miroir, PAS a la table intranet", async () => {
    const miroir = new FakeMiroir(miroirRows);
    const dates = new FakeDates();
    const c = new CompositeCoproRepository(miroir, new FakeEstale(estaleRows), dates);
    await c.setDateEvenement("S104", "cs", "prochaine", "2026-10-10", "u1");
    expect(dates.ecritures).toHaveLength(0);
    expect(miroir.setAppels).toHaveLength(1);
    expect(miroir.setAppels[0].code).toBe("S104");
  });
});
