import { beforeEach, describe, expect, it, vi } from "vitest";

// REA-140 : le cron quotidien. Envoie aux comptables de l'agence depuis la boite du
// gestionnaire, une seule fois par (copro, date du CS), et jamais si les comptes sont verifies.

const etat = vi.hoisted(() => ({
  copros: [] as Record<string, unknown>[],
  verifies: new Set<string>(),
  traces: new Set<string>(),
  traceKo: false,
  panneMail: false,
  envois: [] as { boite: string; a: string[]; cc: string[]; sujet: string; corps: string }[],
}));

vi.mock("@/lib/observabilite", () => ({ signalerException: () => undefined }));
vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({ listerToutes: async () => etat.copros }),
  getComptaRepository: () => ({
    async getEtats(cles: { coproCode: string; agDateISO: string }[]) {
      return new Map(
        cles.map((k) => [
          `${k.coproCode}|${k.agDateISO}`,
          { comptesVerifies: etat.verifies.has(k.coproCode), envoyerAvant: false, checks: {}, notes: [] },
        ]),
      );
    },
  }),
  getAgenceRepository: () => ({ listerAgences: async () => [{ id: "ag-ml", code: "ML" }] }),
  getGestionnaireRepository: () => ({
    list: async () => [
      { id: "g1", email: "gest@real31.fr" },
      { id: "g2", email: "assist@real31.fr" },
    ],
  }),
  getRappelEnvoyeRepository: () => ({
    async reserver(cle: string) {
      if (etat.traceKo) throw new Error("Trace des rappels absente");
      if (etat.traces.has(cle)) return false;
      etat.traces.add(cle);
      return true;
    },
    async liberer(cle: string) {
      etat.traces.delete(cle);
    },
  }),
  getMailOutboundProvider: () => ({
    async envoyerNeuf(p: (typeof etat.envois)[number]) {
      if (etat.panneMail) throw new Error("Graph HTTP 503");
      etat.envois.push(p);
    },
  }),
}));

import { comptablesPourAgence } from "@/lib/domain/perimetre-comptable";
import { rappelerComptesAvantCs } from "./rappeler-comptes-avant-cs";

// 12/10/2026 a 7 h a Paris.
const MAINTENANT = new Date("2026-10-12T05:00:00Z");
const copro = (code: string, cs: string, extra: Record<string, unknown> = {}) => ({
  code,
  nom: `Copro ${code}`,
  agenceId: "ag-ml",
  managerId: "g1",
  prochaineCsDate: cs,
  prochaineCsHeure: "18:00",
  prochaineAg: { date: "2026-12-01", statut: "planifiee" },
  ...extra,
});

beforeEach(() => {
  etat.copros = [];
  etat.verifies = new Set();
  etat.traces = new Set();
  etat.traceKo = false;
  etat.panneMail = false;
  etat.envois = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("rappelerComptesAvantCs", () => {
  it("CS a J-10, comptes non verifies -> mail aux comptables, depuis et en copie du gestionnaire", async () => {
    etat.copros = [copro("S1", "2026-10-22")];
    const b = await rappelerComptesAvantCs(MAINTENANT);
    expect(b.envoyes).toEqual(["S1"]);
    expect(etat.envois).toHaveLength(1);
    expect(etat.envois[0].a).toEqual(comptablesPourAgence("ML"));
    expect(etat.envois[0].a.length).toBeGreaterThan(0);
    expect(etat.envois[0].boite).toBe("gest@real31.fr");
    expect(etat.envois[0].cc).toEqual(["gest@real31.fr"]);
    expect(etat.envois[0].sujet).toBe("S1 - Comptes à vérifier avant le conseil syndical du 22/10/2026");
    expect(etat.envois[0].corps).toContain("se réunit dans 10 jours, le 22/10/2026 à 18:00.");
    expect(etat.envois[0].corps).toContain("L'assemblée générale est prévue le 01/12/2026.");
  });

  it("comptes verifies -> rien", async () => {
    etat.copros = [copro("S1", "2026-10-22")];
    etat.verifies.add("S1");
    const b = await rappelerComptesAvantCs(MAINTENANT);
    expect(b.candidats).toBe(0);
    expect(etat.envois).toHaveLength(0);
  });

  it("IDEMPOTENT : un second passage n'envoie pas deux fois", async () => {
    etat.copros = [copro("S1", "2026-10-22")];
    await rappelerComptesAvantCs(MAINTENANT);
    const b = await rappelerComptesAvantCs(MAINTENANT);
    expect(b.dejaEnvoyes).toEqual(["S1"]);
    expect(etat.envois).toHaveLength(1);
  });

  it("envoi rate -> cle liberee, le passage suivant retente", async () => {
    etat.copros = [copro("S1", "2026-10-22")];
    etat.panneMail = true;
    const b1 = await rappelerComptesAvantCs(MAINTENANT);
    expect(b1.erreurs).toHaveLength(1);
    expect(etat.traces.size).toBe(0);
    etat.panneMail = false;
    expect((await rappelerComptesAvantCs(MAINTENANT)).envoyes).toEqual(["S1"]);
  });

  it("trace illisible (SQL pas passe) -> aucun envoi", async () => {
    etat.copros = [copro("S1", "2026-10-22")];
    etat.traceKo = true;
    const b = await rappelerComptesAvantCs(MAINTENANT);
    expect(b.envoyes).toEqual([]);
    expect(b.erreurs).toHaveLength(1);
    expect(etat.envois).toHaveLength(0);
  });

  it("repli sur l'assistant ; sans boite ou sans comptable -> ignore", async () => {
    etat.copros = [
      copro("S1", "2026-10-20", { managerId: undefined, assistantId: "g2" }),
      copro("S2", "2026-10-20", { managerId: "inconnu" }),
      copro("S3", "2026-10-20", { agenceId: "ag-absente" }),
    ];
    const b = await rappelerComptesAvantCs(MAINTENANT);
    expect(b.envoyes).toEqual(["S1"]);
    expect(etat.envois[0].boite).toBe("assist@real31.fr");
    expect(b.ignores.map((i) => i.copro).sort()).toEqual(["S2", "S3"]);
  });

  it("CS hors fenetre -> rien", async () => {
    etat.copros = [copro("S1", "2026-11-30"), copro("S2", "2026-10-12")];
    const b = await rappelerComptesAvantCs(MAINTENANT);
    expect(b.candidats).toBe(0);
    expect(etat.envois).toHaveLength(0);
  });
});
