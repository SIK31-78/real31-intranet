import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Proposition } from "@/lib/domain/proposition/proposition";

// Le service orchestre quatre ecritures : on verifie l'ordre, le journal, et qu'un echec
// en cours de route laisse les etapes faites et le dit.

const etat = {
  proposition: null as Proposition | null,
  sauvegardes: [] as Proposition[],
  copros: [] as { code: string }[],
  contrats: [] as unknown[],
  clients: [] as unknown[],
  dossiers: [] as unknown[],
  pannePennylane: false,
  panneReferentiel: false,
};

vi.mock("@/lib/adapters/router", () => ({
  getPropositionRepository: () => ({
    async get() {
      return etat.proposition;
    },
    async sauver(p: Proposition) {
      etat.sauvegardes.push(p);
      etat.proposition = p;
    },
  }),
  getCoproRepository: () => ({
    async listerToutes() {
      if (etat.panneReferentiel) throw new Error("PostgREST timeout");
      return etat.copros;
    },
    async creerCopro(c: { code: string }) {
      etat.copros.push(c);
    },
  }),
  getFacturationRepository: () => ({
    async listerBareme() {
      return [{ identifiantPrestation: "AGE", montantTtc: 40.8 }];
    },
    async creerContrat(c: unknown) {
      etat.contrats.push(c);
      return "contrat-1";
    },
  }),
  getInvoicingProvider: () => ({
    async creerClient(c: unknown) {
      if (etat.pannePennylane) throw new Error("Création du client Pennylane : HTTP 500");
      etat.clients.push(c);
      return { clientExterneId: "42" };
    },
  }),
  getAgenceRepository: () => ({ async listerAgences() { return []; } }),
  getGestionnaireRepository: () => ({ async list() { return []; } }),
}));
vi.mock("@/lib/reprise/adapters/router", () => ({ getRepriseDossierRepository: () => ({}) }));
vi.mock("@/lib/reprise/services/suivi-dossier", () => ({
  async creerDossierSuivi(_repo: unknown, ref: string, nom: string, adresse: string, options: unknown) {
    etat.dossiers.push({ ref, nom, adresse, options });
  },
}));

import { elireProposition } from "./election";

const base: Proposition = {
  id: "p1",
  statut: "accepte_cs",
  agence: "LGC",
  immeuble: { adresse: "16 rue Sébastopol", codePostal: "92400", commune: "Courbevoie", immatriculation: "AB0175828", lotsPrincipaux: 8, syndicActuel: "FONCIA" },
  contact: { nom: "Mme X", email: "x@y.fr" },
  prix: { honorairesTtc: 4944, fraisPostauxReels: true },
  agPrevueISO: "2026-11-20",
  journal: [],
  creeParNom: "test",
  creeLeISO: "2026-09-16",
  majLeISO: "2026-09-16",
};
const choix = { code: "S307", nomUsuel: "SEBASTOPOL16", debutISO: "2027-01-01", dureeMois: 12, creerClientPennylane: true, ouvrirDossierReprise: true };

beforeEach(() => {
  etat.proposition = { ...base, journal: [] };
  etat.sauvegardes = [];
  etat.copros = [{ code: "S302" }];
  etat.contrats = [];
  etat.clients = [];
  etat.dossiers = [];
  etat.pannePennylane = false;
  etat.panneReferentiel = false;
});

describe("elireProposition", () => {
  it("cree la fiche, le contrat, le client et le dossier, dans l'ordre, et le journal le dit", async () => {
    const r = await elireProposition("p1", choix, { nom: "Galiano", email: "g@real31.fr" });
    expect(r.coproCode).toBe("S307");
    expect(r.etapes).toHaveLength(4);
    expect(etat.copros.map((c) => c.code)).toEqual(["S302", "S307"]);
    expect(etat.contrats[0]).toMatchObject({ coproCode: "S307", debutContrat: "2027-01-01", finContrat: "2027-12-31", honorairesGestionTtc: 4944, fraisPostauxReels: true, tarifs: { AGE: 40.8 } });
    expect(etat.clients[0]).toMatchObject({ nom: "SDC 16 rue Sébastopol - S307", codePostal: "92400", emails: ["g@real31.fr"] });
    expect(etat.dossiers[0]).toMatchObject({ ref: "S307", nom: "SEBASTOPOL16", options: { sortant: "FONCIA", dateBascule: "2027-01-01" } });
    const finale = etat.proposition!;
    expect(finale.statut).toBe("elu");
    expect(finale.coproCode).toBe("S307");
    expect(finale.journal.map((j) => j.texte.split(" ")[0])).toEqual(["Copropriété", "Contrat", "Client", "Dossier"]);
  });

  it("refuse un code deja pris, sans rien creer", async () => {
    await expect(elireProposition("p1", { ...choix, code: "S302" }, { nom: "G" })).rejects.toThrow(/existe déjà/);
    expect(etat.copros).toHaveLength(1);
  });

  it("referentiel illisible : refuse, rien n'est cree (pas de S001 a l'aveugle)", async () => {
    etat.panneReferentiel = true;
    await expect(elireProposition("p1", choix, { nom: "G" })).rejects.toThrow(/Référentiel des copropriétés indisponible.*PostgREST timeout/);
    expect(etat.copros).toHaveLength(1);
    expect(etat.sauvegardes).toHaveLength(0);
  });

  it("refuse une proposition deja elue", async () => {
    etat.proposition = { ...base, coproCode: "S300" };
    await expect(elireProposition("p1", choix, { nom: "G" })).rejects.toThrow(/déjà donné la copropriété S300/);
  });

  it("une panne Pennylane laisse la fiche et le contrat, et le dit", async () => {
    etat.pannePennylane = true;
    await expect(elireProposition("p1", choix, { nom: "G" })).rejects.toThrow(/HTTP 500 — étapes déjà faites : 2/);
    expect(etat.copros).toHaveLength(2);
    expect(etat.contrats).toHaveLength(1);
    expect(etat.dossiers).toHaveLength(0);
    expect(etat.proposition!.coproCode).toBe("S307");
    expect(etat.proposition!.journal.at(-1)!.texte).toMatch(/^Élection interrompue/);
  });
});
