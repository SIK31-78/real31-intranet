import { beforeEach, describe, expect, it, vi } from "vitest";

// Prestataires d'une copro (REA-333) : listes par métier depuis le référentiel, lier / délier
// avec contrôle du métier et du statut, journal par geste.

import type { Entreprise } from "@/lib/domain/cles/types";
import type { EntreeJournalContrats, MetierPrestataire, NouvelleEntreeJournal, PrestataireCopro } from "@/lib/domain/contrats-copro/types";

const etat = vi.hoisted(() => ({
  entreprises: [] as Entreprise[],
  lies: [] as PrestataireCopro[],
  journal: [] as NouvelleEntreeJournal[],
  appels: [] as string[],
}));

vi.mock("@/lib/observabilite", () => ({ signalerException: () => undefined }));
vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({ exigerPerimetre: async () => undefined }));
vi.mock("@/lib/adapters/router", () => ({
  getClesEntrepriseRepository: () => ({
    lister: async () => etat.entreprises,
    listerParMetier: async (m: MetierPrestataire) => etat.entreprises.filter((e) => (e.metiers ?? []).includes(m)),
    get: async (id: string) => etat.entreprises.find((e) => e.id === id) ?? null,
  }),
  getContratsCoproRepository: () => ({
    listerPrestataires: async () => etat.lies,
    lierPrestataire: async (p: { coproCode: string; entrepriseId: string; metier: MetierPrestataire; principal: boolean }) => {
      etat.appels.push(`lier:${p.entrepriseId}:${p.metier}:${p.principal}`);
    },
    delierPrestataire: async (coproCode: string, entrepriseId: string, metier: MetierPrestataire) => {
      etat.appels.push(`delier:${entrepriseId}:${metier}`);
    },
    ajouterJournal: async (e: NouvelleEntreeJournal): Promise<EntreeJournalContrats> => {
      etat.journal.push(e);
      return { ...e, id: `j-${etat.journal.length}`, horodatageISO: "2026-10-16T10:00:00Z" };
    },
  }),
}));

import { delierPrestataire, entreprisesParMetier, entreprisesParMetiers, lierPrestataire } from "./prestataires";

const AUTEUR = { id: "u-1", nom: "Léa Martin" };

function entreprise(p: Partial<Entreprise> & Pick<Entreprise, "id" | "nom">): Entreprise {
  return {
    nomNormalise: p.nom.toLowerCase(),
    contacts: [],
    statut: "active",
    relances: true,
    source: "intranet",
    creeLeISO: "2026-01-01",
    ...p,
  } as Entreprise;
}

beforeEach(() => {
  etat.entreprises = [
    entreprise({ id: "e-otis", nom: "Otis", metiers: ["ascensoriste"] }),
    entreprise({ id: "e-martin", nom: "Ascenseurs Martin", metiers: ["ascensoriste"] }),
    entreprise({ id: "e-areas", nom: "Areas", metiers: ["courtier"], courtierPartenaire: true }),
    entreprise({ id: "e-bloquee", nom: "Bloquée SARL", metiers: ["ascensoriste"], statut: "bloquee" }),
    entreprise({ id: "e-sans", nom: "Sans métier" }),
  ];
  etat.lies = [];
  etat.journal = [];
  etat.appels = [];
});

describe("listes par métier", () => {
  it("rend les entreprises d'un métier, triées, sans les bloquées", async () => {
    const liste = await entreprisesParMetier("ascensoriste");
    expect(liste.map((e) => e.nom)).toEqual(["Ascenseurs Martin", "Otis"]);
    expect(liste.every((e) => e.courtierPartenaire === false)).toBe(true);
  });

  it("répartit tout le référentiel par métier en une lecture, avec le drapeau courtier partenaire", async () => {
    const parMetier = await entreprisesParMetiers();
    expect(Object.keys(parMetier).sort()).toEqual(["ascensoriste", "assureur", "courtier", "fournisseur_gaz", "organisme_controle", "societe_vmc"]);
    expect(parMetier.ascensoriste.map((e) => e.nom)).toEqual(["Ascenseurs Martin", "Otis"]);
    expect(parMetier.courtier).toEqual([{ id: "e-areas", nom: "Areas", courtierPartenaire: true }]);
    expect(parMetier.fournisseur_gaz).toEqual([]);
  });
});

describe("lier un prestataire", () => {
  it("lie une entreprise du bon métier et le journalise avec son nom", async () => {
    await lierPrestataire({ coproCode: "S104", entrepriseId: "e-otis", metier: "ascensoriste", principal: true }, AUTEUR);
    expect(etat.appels).toEqual(["lier:e-otis:ascensoriste:true"]);
    expect(etat.journal[0]).toMatchObject({ type: "prestataire_lie", coproCode: "S104", sujet: null, parNom: "Léa Martin", details: { entreprise: "Otis", metier: "ascensoriste" } });
  });

  it("refuse une entreprise inconnue, bloquée, ou qui n'exerce pas ce métier", async () => {
    await expect(lierPrestataire({ coproCode: "S104", entrepriseId: "e-inconnue", metier: "ascensoriste", principal: false }, AUTEUR)).rejects.toThrow(/introuvable/);
    await expect(lierPrestataire({ coproCode: "S104", entrepriseId: "e-bloquee", metier: "ascensoriste", principal: false }, AUTEUR)).rejects.toThrow(/bloquée/);
    await expect(lierPrestataire({ coproCode: "S104", entrepriseId: "e-otis", metier: "courtier", principal: false }, AUTEUR)).rejects.toThrow(/courtier/);
    await expect(lierPrestataire({ coproCode: "S104", entrepriseId: "e-otis", metier: "plombier" as MetierPrestataire, principal: false }, AUTEUR)).rejects.toThrow(/inconnu/);
    expect(etat.appels).toEqual([]);
    expect(etat.journal).toEqual([]);
  });
});

describe("délier un prestataire", () => {
  it("délie un prestataire rattaché et journalise son nom", async () => {
    etat.lies = [{ coproCode: "S104", entrepriseId: "e-otis", entrepriseNom: "Otis", metier: "ascensoriste", principal: true, email: null }];
    await delierPrestataire({ coproCode: "S104", entrepriseId: "e-otis", metier: "ascensoriste" }, AUTEUR);
    expect(etat.appels).toEqual(["delier:e-otis:ascensoriste"]);
    expect(etat.journal[0]).toMatchObject({ type: "prestataire_delie", details: { entreprise: "Otis", metier: "ascensoriste" } });
  });

  it("refuse de délier ce qui n'est pas rattaché", async () => {
    await expect(delierPrestataire({ coproCode: "S104", entrepriseId: "e-otis", metier: "ascensoriste" }, AUTEUR)).rejects.toThrow(/rattaché/);
    expect(etat.appels).toEqual([]);
  });
});
