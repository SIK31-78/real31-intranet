// Frais postaux au reel (REA-490) : la facture ESTALE choisie, le regime du contrat EN
// VIGUEUR ce mois-la, les envois rattaches par leur mailing.

import { describe, expect, it, vi } from "vitest";
import type { ContratCopro, NouvelleFacture } from "@/lib/ports/facturation-repository";
import type { LigneConsommationEstale } from "@/lib/domain/facturation/frais-postaux-reels";
import type { ConsommationEstaleProvider, FactureEstaleRecue } from "@/lib/ports/consommation-estale-provider";

const etat = vi.hoisted(() => ({
  cycles: new Map<string, ContratCopro[]>(),
  creees: [] as NouvelleFacture[],
  emises: [] as string[][],
}));

function ligne(p: Partial<LigneConsommationEstale>): LigneConsommationEstale {
  return {
    scope: "Appel de fonds",
    categorie: "Timbre Ecopli",
    dateISO: "2026-09-17",
    prixUnitaireHtCentimes: 74,
    prixUnitaireTtcCentimes: 74,
    quantite: 1,
    sourceId: "af",
    detail: "[S0305] Appel de fonds du 16/09/2026 ~ X",
    ...p,
  };
}

const FACTURES: FactureEstaleRecue[] = [
  { reference: "F-10", dateISO: "2026-10-01", montantHt: 1, montantTtc: 1, statut: "ISSUED" },
  { reference: "F-08", dateISO: "2026-08-01", montantHt: 1, montantTtc: 1, statut: "PAID" },
];
const LIGNES = new Map([
  ["F-08", [ligne({ detail: "[S0307] Appel de fonds ~ X" }), ligne({ detail: "Faisons connaissance ~ X", sourceId: "m306" })]],
  ["F-10", [ligne({ detail: "[S0307] Appel de fonds ~ X" }), ligne({})]],
]);
const estale: ConsommationEstaleProvider = {
  listerFactures: async () => FACTURES,
  lireConsommation: async (ref) => LIGNES.get(ref) ?? [],
  coprosDesMailings: async () => new Map([["m306", ["S306"]]]),
};

vi.mock("@/lib/adapters/router", () => ({
  getConsommationEstaleProvider: () => estale,
  getFacturationRepository: () => ({
    async listerCyclesContrat(code: string) {
      return etat.cycles.get(code) ?? [];
    },
    async listerFacturesDePeriode(type: string, periode: string) {
      return etat.creees
        .filter((f) => f.typePrestation === type && f.periode === periode)
        .map((f, i) => ({ id: `f${i}`, coproCode: f.coproCode, statut: "facturee", dateFacture: f.dateFacture }));
    },
    async creerFacture(f: NouvelleFacture) {
      etat.creees.push(f);
      return `f${etat.creees.length}`;
    },
  }),
}));

vi.mock("./emettre-factures-en-attente", () => ({
  async emettreFacturesEnAttente(ids: string[]) {
    etat.emises.push(ids);
    return {
      emises: ids.length,
      enErreur: 0,
      erreurs: [],
      estale: { envoyees: ids.length, aCodifier: 0, enAttente: 0, enErreur: 0, erreurs: [] },
    };
  },
}));

const { apercuFraisPostaux, facturerFraisPostaux } = await import("./frais-postaux-reels");

function cycle(coproCode: string, debutContrat: string, fraisPostauxReels: boolean): ContratCopro {
  return { id: `${coproCode}-${debutContrat}`, coproCode, debutContrat, ...(fraisPostauxReels ? { fraisPostauxReels } : {}) };
}

etat.cycles.set("S305", [cycle("S305", "2026-05-29", true)]);
etat.cycles.set("S306", [cycle("S306", "2026-06-24", true)]);
// S307 passe au reel au 01/10/2026 : au forfait en aout.
etat.cycles.set("S307", [cycle("S307", "2025-10-01", false), cycle("S307", "2026-10-01", true)]);

describe("apercuFraisPostaux", () => {
  it("prend la facture ESTALE la plus récente par défaut", async () => {
    const a = await apercuFraisPostaux();
    expect(a.reference).toBe("F-10");
    expect(a.factures.map((f) => f.reference)).toEqual(["F-10", "F-08"]);
  });

  it("suit le contrat en vigueur le mois de la facture", async () => {
    const aout = await apercuFraisPostaux("F-08");
    // S305 n'apparait ni dans la facture d'aout ni dans un mailing : elle n'est pas listee.
    expect(aout.coprosAuReel).toEqual(["S306"]);
    expect(aout.periode.parCopro.map((c) => c.coproCode)).toEqual(["S306"]);

    const octobre = await apercuFraisPostaux("F-10");
    expect(octobre.coprosAuReel).toEqual(["S305", "S306", "S307"]);
    expect(octobre.periode.parCopro.map((c) => c.coproCode)).toEqual(["S305", "S307"]);
  });

  it("répond vide sans facture ESTALE", async () => {
    const a = await apercuFraisPostaux("INCONNUE");
    expect(a).toMatchObject({ reference: null, coprosAuReel: [], periode: { parCopro: [], nonRattaches: [] } });
  });
});

describe("facturerFraisPostaux", () => {
  it("crée une facture frais postaux par copro, sur les seuls envois retenus, sans service par défaut", async () => {
    etat.creees.length = 0;
    const r = await facturerFraisPostaux("F-10", [{ coproCode: "S305", sourceIds: ["af", "inconnu"] }], false, "SK");
    expect(r).toMatchObject({ creees: 1, emises: 1, enErreur: 0, ignorees: [] });
    const f = etat.creees[0]!;
    expect(f).toMatchObject({
      coproCode: "S305",
      typePrestation: "frais_postaux",
      periode: "F-10",
      libelle: "Frais postaux octobre 2026",
      details: { factureEstale: "F-10", envois: ["af"], avecService: false },
    });
    expect(f.lignes).toEqual([
      {
        description: "Frais postaux octobre 2026\n1 Lettres simples : 0,74 €",
        categorieProduit: "Forfait frais postaux",
        quantite: 1,
        prixUnitaireHt: 0.74,
        tauxTva: 0,
      },
    ]);
  });

  it("ne refacture jamais deux fois la même facture ESTALE pour une copro", async () => {
    const r = await facturerFraisPostaux("F-10", [{ coproCode: "S305", sourceIds: ["af"] }], false, "SK");
    expect(r.creees).toBe(0);
    expect(r.ignorees).toEqual([{ coproCode: "S305", motif: "Déjà facturée pour la facture ESTALE F-10." }]);
  });

  it("ignore une copro au forfait ce mois-là, même si l'écran l'envoie", async () => {
    const r = await facturerFraisPostaux("F-08", [{ coproCode: "S307", sourceIds: ["af"] }], true, "SK");
    expect(r.creees).toBe(0);
    expect(r.ignorees[0]!.motif).toContain("Pas au réel");
  });
});
