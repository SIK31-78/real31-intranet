// Fix B (frais postaux reels) cote gestion courante : une copro dont le drapeau
// frais_postaux_reels est vrai NE doit PAS recevoir de ligne de timbres (ses frais
// sont refactures au reel, ailleurs). Une copro au forfait recoit bien 2 lignes.
// Le repo (routeur) est mocke : il enregistre les factures creees pour inspection.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LigneGestionCourante, NouvelleFacture } from "@/lib/ports/facturation-repository";
import { CATEGORIE_FORFAIT_POSTAUX } from "@/lib/domain/facturation/produits";

const etat = vi.hoisted(() => {
  const ref = {
    base: [] as LigneGestionCourante[],
    creees: [] as NouvelleFacture[],
    reset() {
      ref.base = [];
      ref.creees = [];
    },
  };
  return ref;
});

vi.mock("@/lib/adapters/router", () => ({
  getFacturationRepository: () => ({
    async chargerGestionCourante() {
      return etat.base;
    },
    async creerFacture(input: NouvelleFacture) {
      etat.creees.push(input);
      return `facture-${etat.creees.length}`;
    },
    // Emission neutralisee : rien a emettre (le test porte sur les lignes creees).
    async listerFacturesAEmettre() {
      return [];
    },
    async chargerProduits() {
      return [];
    },
  }),
  // Jamais appele (aucune facture a emettre), mais getInvoicingProvider() est resolu.
  getInvoicingProvider: () => ({}),
}));

import {
  apercuGestionCourante,
  lancerGestionCourante,
} from "@/lib/services/facturation/gestion-courante";

beforeEach(() => {
  etat.reset();
});

describe("gestion courante - frais postaux reels (Fix B)", () => {
  it("copro en frais reels : facture SANS ligne de timbres (1 seule ligne)", async () => {
    etat.base = [
      {
        coproCode: "S010",
        honorairesAnnuelsTtc: 4800,
        forfaitPostauxAnnuel: 400, // present, mais ignore car frais reels
        fraisPostauxReels: true,
        dejaFacture: false,
      },
    ];

    await lancerGestionCourante("2026-T3", "AB");

    expect(etat.creees).toHaveLength(1);
    const lignes = etat.creees[0]!.lignes;
    expect(lignes).toHaveLength(1); // honoraires seulement
    expect(lignes.some((l) => l.categorieProduit === CATEGORIE_FORFAIT_POSTAUX)).toBe(false);
  });

  it("copro au forfait : facture AVEC ligne de timbres (2 lignes)", async () => {
    etat.base = [
      {
        coproCode: "S011",
        honorairesAnnuelsTtc: 4800,
        forfaitPostauxAnnuel: 400,
        fraisPostauxReels: false,
        dejaFacture: false,
      },
    ];

    await lancerGestionCourante("2026-T3", "AB");

    const lignes = etat.creees[0]!.lignes;
    expect(lignes).toHaveLength(2);
    const timbres = lignes.find((l) => l.categorieProduit === CATEGORIE_FORFAIT_POSTAUX);
    expect(timbres?.prixUnitaireHt).toBe(100); // 400 / 4, sans TVA
  });

  it("apercu : frais reels -> timbres a 0 dans le recapitulatif", async () => {
    etat.base = [
      {
        coproCode: "S010",
        honorairesAnnuelsTtc: 4800,
        forfaitPostauxAnnuel: 400,
        fraisPostauxReels: true,
        dejaFacture: false,
      },
    ];
    const apercu = await apercuGestionCourante("2026-T3");
    expect(apercu.totalTimbres).toBe(0);
    expect(apercu.lignes[0]!.timbres).toBe(0);
  });
});
