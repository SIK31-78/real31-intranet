// Assemblage des valeurs du contrat de syndic. Ce qui se joue ici : le contrat
// imprime doit tomber sur les MEMES centimes que ceux deja signes via PowerApps.
// D'ou les valeurs de reference prises sur le bareme 2026 reel.

import { describe, expect, it } from "vitest";
import {
  assemblerChampsContrat,
  PRESTATIONS_CONTRAT,
  type CoproContrat,
  type CycleContratChamps,
  type PrestationContrat,
} from "./champs-contrat";
import { htDepuisTtc, ttcBrut } from "./montants-contrat";

const COPRO: CoproContrat = {
  code: "S215",
  nom: "BLEUETS4",
  adresse1: "4 rue des Bleuets",
  adresse2: "",
  adresse3: "",
  codePostal: "92250",
  ville: "LA GARENNE-COLOMBES",
  immatriculation: "AI2016400",
  assurance: "AXA",
  assuranceDateISO: "2023-06-27",
  agence: "LGC",
  lotsPrincipaux: 18,
  lotsAutres: 18,
  nbVisites: 1,
  dureeAgHeures: 2,
  nbCs: 1,
  dureeCsHeures: 1,
  finMaxAgHeure: 22,
};

const CYCLE: CycleContratChamps = {
  dateAgISO: "2026-10-22",
  debutISO: "2026-07-01",
  finISO: "2027-06-30",
  honorairesGestionTtc: 9419,
  forfaitPostauxTtc: 792,
};

/** Bareme complet, valeurs 2026 reelles pour les prestations citees. */
function bareme(
  surcharges: Partial<Record<PrestationContrat, { libelle: string; ttc: number }>> = {},
): Record<PrestationContrat, { libelle: string; ttc: number }> {
  const reels: Partial<Record<PrestationContrat, number>> = {
    AGE: 40.8,
    CSSupp: 228,
    VisiteSupp: 228,
    ModifRCP: 26.25,
    DepLieu: 95,
    MesConser: 214,
    AssExp: 137,
    DossierAssureur: 117,
    MED: 60,
    DossierAvocat: 197.8,
    RepriseCompta: 46.5,
    DossierEmprunt: 25.25,
    ImmatInitiale: 183,
    Echeancier: 99,
    Hypotheque: 453,
    Injonction: 207,
    DossierJustice: 196,
    EtatDate: 380,
    Opposition: 260,
    DelivranceCopie: 75,
    TauxHoraire: 163.65,
  };
  const grille = {} as Record<PrestationContrat, { libelle: string; ttc: number }>;
  for (const p of PRESTATIONS_CONTRAT) grille[p] = { libelle: p, ttc: reels[p] ?? 0 };
  return { ...grille, ...surcharges };
}

describe("assemblerChampsContrat", () => {
  it("reporte la duree sous la forme exacte du legacy", () => {
    expect(assemblerChampsContrat(COPRO, CYCLE, bareme()).dureeTexte).toBe("1 an, 0 mois, 0 jour");
  });

  it("calcule le HT des honoraires par division par 1,2", () => {
    const c = assemblerChampsContrat(COPRO, CYCLE, bareme());
    expect(c.honorairesGestionTtc).toBe(9419);
    expect(c.honorairesGestionHt).toBe("7849.17"); // 9419 / 1,2
  });

  it("laisse le forfait timbres en TTC brut (le legacy ne le convertit pas)", () => {
    expect(assemblerChampsContrat(COPRO, CYCLE, bareme()).forfaitPostauxTtc).toBe(792);
  });

  it("prend l'annee du bareme sur la date d'AG, pas sur le debut du cycle (regle MYTHEC)", () => {
    // AG en octobre 2026 pour un mandat qui demarre le 01/01/2027 : c'est le bareme 2026
    // qui s'applique - ORLEANS7, le cas qui a fait corriger la regle le 14/09/2026.
    const c = assemblerChampsContrat(
      COPRO,
      { ...CYCLE, dateAgISO: "2026-10-29", debutISO: "2027-01-01", finISO: "2027-12-31" },
      bareme(),
    );
    expect(c.anneeBareme).toBe(2026);
  });

  it("rend les 21 prestations, dans l'ordre du document", () => {
    const c = assemblerChampsContrat(COPRO, CYCLE, bareme());
    expect(c.tarifs).toHaveLength(21);
    expect(c.tarifs.map((t) => t.identifiant)).toEqual([...PRESTATIONS_CONTRAT]);
  });

  it("porte les deux valeurs par prestation : le TTC du bareme et son HT", () => {
    const c = assemblerChampsContrat(COPRO, CYCLE, bareme());
    const horaire = c.tarifs.find((t) => t.identifiant === "TauxHoraire")!;
    expect(horaire.ttc).toBe(163.65);
    expect(horaire.ttcTexte).toBe("163.65");
    expect(horaire.ht).toBe("136.38"); // 163,65 / 1,2 = 136,375 -> 136.38
  });

  it("LEVE si une prestation manque au bareme (jamais un zero silencieux)", () => {
    // C'est le cas reel du bareme 2024, qui ne contient que TauxHoraire : PowerApps
    // aurait imprime « 0,00 € » sur toute la grille du contrat sans rien signaler.
    const incomplet = bareme();
    delete (incomplet as Record<string, unknown>).EtatDate;
    delete (incomplet as Record<string, unknown>).Hypotheque;
    // Les manquantes sont listees dans l'ORDRE DU DOCUMENT, pas dans l'ordre ou on
    // les a perdues : c'est celui que le gestionnaire a sous les yeux.
    expect(() => assemblerChampsContrat(COPRO, CYCLE, incomplet)).toThrow(
      /absentes du bareme \(Hypotheque, EtatDate\)/,
    );
  });

  it("reporte la copropriete telle quelle, y compris la duree de CS en heures", () => {
    const c = assemblerChampsContrat(COPRO, CYCLE, bareme());
    expect(c.copro.dureeCsHeures).toBe(1);
    expect(c.copro.immatriculation).toBe("AI2016400");
    expect(c.copro.lotsPrincipaux + c.copro.lotsAutres).toBe(36);
  });
});

describe("conversions TTC / HT", () => {
  it("arrondit au centime comme le legacy", () => {
    expect(htDepuisTtc(163.65)).toBe("136.38");
    expect(htDepuisTtc(40.8)).toBe("34.00");
    expect(ttcBrut(40.8)).toBe("40.80");
  });

  it("supporte un tarif a zero sans produire NaN", () => {
    expect(htDepuisTtc(0)).toBe("0.00");
  });
});
