// File des recaps d'AG recus : ce qui compte ici, c'est le CLOISONNEMENT (personne ne
// voit les recaps des autres, ni par la liste ni en devinant une URL) et la DEGRADATION
// (le SQL de traitement n'est pas encore passe -> la file marche quand meme).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Copropriete } from "@/lib/domain/copropriete";
import type { RecapAgDetail, RecapAgFileLigne } from "@/lib/ports/recap-ag-repository";

function copro(code: string, nom: string, agenceId: string, managerId: string): Copropriete {
  return {
    code,
    nom,
    source: "crypto",
    adresse: { ligne1: "1 rue du Test", codePostal: "31000", ville: "Toulouse" },
    statut: "active",
    lotsPrincipaux: 10,
    lotsAutres: 0,
    exercice: { debut: "01/01", fin: "31/12" },
    priseEnGestion: "janvier 2020",
    equipe: [],
    agenceId,
    managerId,
  };
}

const COPROS = [
  copro("S104", "Les Marronniers", "ag-ml", "m1"),
  copro("S088", "Résidence Foch", "ag-hls", "m2"),
  // Agence inconnue du referentiel Agency : la copro doit etre EXCLUE du perimetre
  // comptable, jamais incluse par defaut.
  copro("S045", "Rue Sartoris", "ag-fantome", "m1"),
];

function ligne(id: string, coproCode: string, traiteLe?: string): RecapAgFileLigne {
  return {
    id,
    coproCode,
    agDate: "2026-06-10",
    statut: "termine",
    depassementHeures: 0,
    depassementTtc: 0,
    nbTravaux: 1,
    creeLe: "2026-06-11T09:00:00.000Z",
    ...(traiteLe ? { traiteLe, traitePar: "IA" } : {}),
  };
}

const etat = vi.hoisted(() => ({
  listeJette: false,
  marquages: [] as { id: string; traite: boolean; par: string }[],
}));

vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    async list(managerId?: string) {
      return managerId ? COPROS.filter((c) => c.managerId === managerId) : COPROS;
    },
    async findByCode(code: string, managerId?: string) {
      const c = COPROS.find((x) => x.code === code);
      if (!c) return null;
      return managerId && c.managerId !== managerId ? null : c;
    },
  }),
  getAgenceRepository: () => ({
    async listerAgences() {
      return [
        { id: "ag-ml", code: "ML" },
        { id: "ag-hls", code: "HLS" },
      ];
    },
  }),
  getRecapAgRepository: () => ({
    async listerRecapsPourFile(): Promise<RecapAgFileLigne[]> {
      if (etat.listeJette) throw new Error("colonne traite_compta_at inconnue");
      return [ligne("r1", "S104"), ligne("r2", "S088"), ligne("r3", "S045", "2026-06-20T10:00:00.000Z")];
    },
    async getRecapAg(id: string): Promise<RecapAgDetail | null> {
      const parId: Record<string, string> = { r1: "S104", r2: "S088", r3: "S045" };
      const code = parId[id];
      if (!code) return null;
      return {
        id,
        coproCode: code,
        agDate: "2026-06-10",
        debutAg: "2026-06-10T18:00:00",
        finAg: "2026-06-10T20:00:00",
        depassementHeures: 0,
        depassementTtc: 0,
        travaux: [],
        statut: "termine",
        creeLe: "2026-06-11T09:00:00.000Z",
      };
    },
    async marquerTraite(id: string, traite: boolean, par: string) {
      etat.marquages.push({ id, traite, par });
    },
  }),
}));

import {
  getRecapRecu,
  listerRecapsRecus,
  marquerRecapTraite,
} from "@/lib/services/compta/recaps-recus";

// Perimetres declares dans domain/perimetre-comptable (liste fermee) : Isabelle tient ML.
const ISABELLE = { managerId: "compta-1", email: "isabelle.anglade@real31.fr", estComptable: true };
const GESTIONNAIRE_M1 = { managerId: "m1", email: "gestion@real31.fr", estComptable: false };
const COMPTABLE_SANS_PERIMETRE = {
  managerId: "compta-9",
  email: "nouveau.comptable@real31.fr",
  estComptable: true,
};

beforeEach(() => {
  etat.listeJette = false;
  etat.marquages = [];
});

describe("listerRecapsRecus - cloisonnement", () => {
  it("gestionnaire : les recaps de SON portefeuille, separes a traiter / traites", async () => {
    const { aTraiter, traites } = await listerRecapsRecus(GESTIONNAIRE_M1);
    expect(aTraiter.map((r) => r.coproCode)).toEqual(["S104"]);
    expect(traites.map((r) => r.coproCode)).toEqual(["S045"]);
    // Le nom de copro est resolu par le service (le port ne connait que le code).
    expect(aTraiter[0]?.coproNom).toBe("Les Marronniers");
  });

  it("comptable : les recaps de SES agences, et rien d'autre", async () => {
    const { aTraiter, traites } = await listerRecapsRecus(ISABELLE);
    // S104 est en ML (son agence) ; S088 est en HLS ; S045 porte une agence non resolue.
    expect(aTraiter.map((r) => r.coproCode)).toEqual(["S104"]);
    expect(traites).toHaveLength(0);
  });

  it("comptable SANS perimetre declare : file VIDE, jamais tout le cabinet", async () => {
    const { aTraiter, traites } = await listerRecapsRecus(COMPTABLE_SANS_PERIMETRE);
    expect(aTraiter).toHaveLength(0);
    expect(traites).toHaveLength(0);
  });
});

describe("listerRecapsRecus - degradation", () => {
  it("lecture impossible (colonnes / table absentes) : file vide, pas d'exception", async () => {
    etat.listeJette = true;
    await expect(listerRecapsRecus(ISABELLE)).resolves.toEqual({ aTraiter: [], traites: [] });
  });

  it("sans marqueur de traitement, tout est « a traiter »", async () => {
    const { aTraiter } = await listerRecapsRecus(ISABELLE);
    expect(aTraiter.every((r) => r.traiteLe === undefined)).toBe(true);
  });
});

describe("getRecapRecu - garde anti-IDOR", () => {
  it("ouvre un recap de son perimetre", async () => {
    const recap = await getRecapRecu("r1", ISABELLE);
    expect(recap?.coproNom).toBe("Les Marronniers");
  });

  it("refuse un recap hors perimetre (URL devinee)", async () => {
    expect(await getRecapRecu("r2", ISABELLE)).toBeNull();
    expect(await getRecapRecu("r2", GESTIONNAIRE_M1)).toBeNull();
  });

  it("id inconnu : null", async () => {
    expect(await getRecapRecu("r404", ISABELLE)).toBeNull();
  });
});

describe("marquerRecapTraite", () => {
  it("marque un recap de son perimetre", async () => {
    await marquerRecapTraite("r1", true, "IA", ISABELLE);
    expect(etat.marquages).toEqual([{ id: "r1", traite: true, par: "IA" }]);
  });

  it("refuse d'ecrire hors perimetre", async () => {
    await expect(marquerRecapTraite("r2", true, "IA", ISABELLE)).rejects.toThrow(/périmètre/);
    expect(etat.marquages).toHaveLength(0);
  });
});
