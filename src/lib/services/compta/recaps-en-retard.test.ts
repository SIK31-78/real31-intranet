// Alerte « recap d'AG en retard ». Ce qui compte ici : le CLOISONNEMENT (chacun ne voit
// que son perimetre), la lecture BATCH (une seule requete, pas un appel par copro) et la
// DEGRADATION (table absente -> alerte vide, jamais une page cassee).
// La regle elle-meme est testee dans domain/recap-ag/retard.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Copropriete } from "@/lib/domain/copropriete";

const AUJ = "2026-07-27";

function copro(
  code: string,
  nom: string,
  agenceId: string,
  managerId: string,
  dates: { prochaineAg?: string; derniereAg?: string },
): Copropriete {
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
    ...(dates.prochaineAg ? { prochaineAg: { date: dates.prochaineAg, statut: "planifiee" as const } } : {}),
    ...(dates.derniereAg ? { derniereAgDate: dates.derniereAg } : {}),
  };
}

const COPROS = [
  // AG prevue le 30/06, jamais conclue, aucun recap -> en retard, date previsionnelle.
  copro("S104", "Les Marronniers", "ag-ml", "m1", {
    prochaineAg: "2026-06-30",
    derniereAg: "2025-04-09",
  }),
  // Derniere AG tenue il y a longtemps, aucun recap -> en retard, date fiable.
  copro("S088", "Résidence Foch", "ag-hls", "m2", { derniereAg: "2026-02-09" }),
  // Agence inconnue du referentiel Agency : EXCLUE du perimetre comptable.
  copro("S045", "Rue Sartoris", "ag-fantome", "m1", { derniereAg: "2026-03-11" }),
  // Recap rentre a 3 jours de la date du referentiel : couvert par la tolerance.
  copro("S192", "Les Bruyères", "ag-ml", "m1", { derniereAg: "2026-05-18" }),
  // AG a venir : rien a signaler.
  copro("S222", "Le Château", "ag-ml", "m1", {
    prochaineAg: "2026-09-15",
    derniereAg: "2026-06-20",
  }),
];

const etat = vi.hoisted(() => ({
  jette: false,
  appels: [] as (readonly string[])[],
}));

vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    async list(managerId?: string) {
      return managerId ? COPROS.filter((c) => c.managerId === managerId) : COPROS;
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
    async listerDatesAgParCopro(codes: readonly string[]) {
      if (etat.jette) throw new Error('relation "intranet_recap_ag" does not exist');
      etat.appels.push(codes);
      const tout = new Map<string, string[]>([
        ["S192", ["2026-05-21"]], // 3 jours d'ecart : couvre l'AG du 18/05
        ["S222", ["2026-06-20"]],
      ]);
      return new Map([...tout].filter(([code]) => codes.includes(code)));
    },
  }),
}));

import { listerRecapsEnRetard } from "@/lib/services/compta/recaps-en-retard";

// Perimetres declares dans domain/perimetre-comptable (liste fermee) : Isabelle tient ML.
const ISABELLE = { managerId: "compta-1", email: "isabelle.anglade@real31.fr", estComptable: true };
const GESTIONNAIRE_M1 = { managerId: "m1", email: "gestion@real31.fr", estComptable: false };
const COMPTABLE_SANS_PERIMETRE = {
  managerId: "compta-9",
  email: "nouveau.comptable@real31.fr",
  estComptable: true,
};

beforeEach(() => {
  etat.jette = false;
  etat.appels = [];
});

describe("listerRecapsEnRetard", () => {
  it("gestionnaire : les copros de SON portefeuille en retard, la plus ancienne d'abord", async () => {
    const lignes = await listerRecapsEnRetard(GESTIONNAIRE_M1, AUJ);
    // S045 (138 j) avant S104 (27 j) ; S192 est couvert, S222 a son AG devant.
    expect(lignes.map((l) => l.coproCode)).toEqual(["S045", "S104"]);
    expect(lignes[0]?.joursDeRetard).toBe(138);
    expect(lignes[1]).toMatchObject({
      coproNom: "Les Marronniers",
      agDate: "2026-06-30",
      joursDeRetard: 27,
      datePrevisionnelle: true,
    });
  });

  it("marque comme fiable la date d'une AG effectivement tenue", async () => {
    const [ligne] = await listerRecapsEnRetard(
      { managerId: "m2", email: "autre@real31.fr", estComptable: false },
      AUJ,
    );
    expect(ligne).toMatchObject({ coproCode: "S088", datePrevisionnelle: false });
  });

  it("comptable : SES agences, et rien d'autre", async () => {
    const lignes = await listerRecapsEnRetard(ISABELLE, AUJ);
    // S104 est en ML (son agence) ; S088 est en HLS ; S045 porte une agence non resolue.
    expect(lignes.map((l) => l.coproCode)).toEqual(["S104"]);
  });

  it("comptable SANS perimetre declare : alerte VIDE, jamais tout le cabinet", async () => {
    expect(await listerRecapsEnRetard(COMPTABLE_SANS_PERIMETRE, AUJ)).toHaveLength(0);
  });

  it("lit les dates de recap en UNE seule requete pour tout le perimetre", async () => {
    await listerRecapsEnRetard(GESTIONNAIRE_M1, AUJ);
    expect(etat.appels).toHaveLength(1);
    // Uniquement les copros qui ont une AG a surveiller, toutes d'un coup.
    expect([...etat.appels[0]!].sort()).toEqual(["S045", "S104", "S192", "S222"]);
  });

  it("degrade en alerte vide si la table n'existe pas (page jamais cassee)", async () => {
    etat.jette = true;
    expect(await listerRecapsEnRetard(GESTIONNAIRE_M1, AUJ)).toEqual([]);
  });
});
