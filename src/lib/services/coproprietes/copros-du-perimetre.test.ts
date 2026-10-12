// Le perimetre d'une COMPTABLE s'elargit de ses delegations datees actives (REA-158) :
// Isabelle (ML) reprend LGC pendant les conges d'une collegue, sur la facturation, le
// pre-etat date et les recaps (tous passent par getCoprosDuPerimetre / getCoproDuPerimetre).
// Router mocke : on ne teste que le cadrage.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Delegation } from "@/lib/domain/perimetre-ecriture";

const etat = vi.hoisted(() => ({
  delegations: [] as Delegation[],
}));

const COPROS = [
  { code: "S100", agenceId: "a-ml", managerId: "g-ml" },
  { code: "S200", agenceId: "a-lgc", managerId: "g-lgc" },
  { code: "S300", agenceId: "a-hls", managerId: "g-hls" },
];
const UTILISATEURS: Record<string, { id: string; email: string; role?: string }> = {
  isabelle: { id: "isabelle", email: "isabelle.anglade@real31.fr", role: "COMPTABLE" },
  romain: { id: "romain", email: "romain.gobert@real31.fr", role: "COMPTABLE" },
  "g-hls": { id: "g-hls", email: "gestion.hls@real31.fr", role: "GESTIONNAIRE" },
};

vi.mock("@/lib/adapters/router", () => ({
  getAgenceRepository: () => ({
    async listerAgences() {
      return [
        { id: "a-ml", code: "ML" },
        { id: "a-lgc", code: "LGC" },
        { id: "a-hls", code: "HLS" },
      ];
    },
  }),
  getCoproRepository: () => ({
    async findByCode(code: string, managerId?: string) {
      const c = COPROS.find((x) => x.code === code);
      if (!c) return null;
      return managerId === undefined || c.managerId === managerId ? c : null;
    },
    async list(managerId: string) {
      return COPROS.filter((c) => c.managerId === managerId);
    },
    async listerToutes() {
      return COPROS;
    },
  }),
  getDelegationRepository: () => ({
    async listerPourBeneficiaire(userId: string) {
      return etat.delegations.filter((d) => d.aUserId === userId);
    },
  }),
  getGestionnaireRepository: () => ({
    async findById(id: string) {
      return UTILISATEURS[id] ?? null;
    },
  }),
}));
vi.mock("@/lib/services/coproprietes/get-coproprietes", () => ({
  getCoproprietes: async () => COPROS,
}));

import { getCoproDuPerimetre, getCoprosDuPerimetre } from "./copros-du-perimetre";

const ISABELLE = { managerId: "isabelle", email: "isabelle.anglade@real31.fr", estComptable: true };
const delegation = (extra: Partial<Delegation>): Delegation => ({
  id: "d1",
  deUserId: "romain",
  aUserId: "isabelle",
  portee: "agence",
  depuisISO: "2020-01-01",
  jusquaISO: "2099-12-31",
  ...extra,
});
const codes = (l: { code: string }[]) => l.map((c) => c.code).sort();

beforeEach(() => {
  etat.delegations = [];
});

describe("getCoprosDuPerimetre - comptable et delegations (REA-158)", () => {
  it("sans delegation : ses seules agences", async () => {
    expect(codes(await getCoprosDuPerimetre(ISABELLE))).toEqual(["S100"]);
  });

  it("delegation de l'agence LGC active : LGC s'ajoute", async () => {
    etat.delegations = [delegation({ agenceCode: "LGC" })];
    expect(codes(await getCoprosDuPerimetre(ISABELLE))).toEqual(["S100", "S200"]);
  });

  it("delegation expiree : le perimetre revient seul a ML", async () => {
    etat.delegations = [delegation({ agenceCode: "LGC", jusquaISO: "2020-12-31" })];
    expect(codes(await getCoprosDuPerimetre(ISABELLE))).toEqual(["S100"]);
  });

  it("portefeuille d'un gestionnaire HLS delegue : ses copros s'ajoutent, pas toute l'agence", async () => {
    etat.delegations = [delegation({ deUserId: "g-hls", portee: "portefeuille" })];
    expect(codes(await getCoprosDuPerimetre(ISABELLE))).toEqual(["S100", "S300"]);
  });
});

describe("getCoproDuPerimetre - garde des vues de detail", () => {
  it("hors perimetre sans delegation : null", async () => {
    expect(await getCoproDuPerimetre("S200", ISABELLE)).toBeNull();
  });

  it("delegation d'une seule copro : elle s'ouvre", async () => {
    etat.delegations = [delegation({ portee: "copro", coproCode: "S200" })];
    expect((await getCoproDuPerimetre("S200", ISABELLE))?.code).toBe("S200");
  });

  it("portefeuille de Romain (comptable HLS/LGC/ASN) delegue : S300 s'ouvre", async () => {
    etat.delegations = [delegation({ portee: "portefeuille" })];
    expect((await getCoproDuPerimetre("S300", ISABELLE))?.code).toBe("S300");
  });
});
