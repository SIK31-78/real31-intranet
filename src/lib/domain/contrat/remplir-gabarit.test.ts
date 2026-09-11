// LE test qui compte pour ce module : le gabarit reel du cabinet porte 65 placeholders,
// et on doit savoir les remplir TOUS. Un seul oubli laisserait un « [Tarifs.Tarif.Xxx] »
// imprime sur un contrat signe par le syndicat.
//
// Il attrape aussi le piege du nommage : la base ecrit `CSSupp`, le gabarit `[CsSuppHT]`.

import { describe, expect, it } from "vitest";
import {
  assemblerChampsContrat,
  PRESTATIONS_CONTRAT,
  type CoproContrat,
  type PrestationContrat,
} from "./champs-contrat";
import { GABARIT_DROITE, GABARIT_GAUCHE, PLACEHOLDERS_GABARIT } from "./gabarit-contrat";
import { placeholdersNonResolus, remplirTexte, tableRemplacement } from "./remplir-gabarit";

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

function champs() {
  const tarifs = {} as Record<PrestationContrat, { libelle: string; ttc: number }>;
  for (const p of PRESTATIONS_CONTRAT) tarifs[p] = { libelle: p, ttc: 120 };
  return assemblerChampsContrat(
    COPRO,
    {
      dateAgISO: "2026-10-22",
      debutISO: "2026-07-01",
      finISO: "2027-06-30",
      honorairesGestionTtc: 9419,
      forfaitPostauxTtc: 792,
    },
    tarifs,
  );
}

describe("tableRemplacement", () => {
  it("couvre TOUS les placeholders du gabarit reel du cabinet", () => {
    const table = tableRemplacement(champs());
    const inconnus = PLACEHOLDERS_GABARIT.filter((p) => table[p] === undefined);
    expect(inconnus).toEqual([]);
  });

  it("resout le nommage divergent CSSupp / CsSupp", () => {
    // La base ecrit `CSSupp`, le gabarit `[CsSuppHT]` : sans la correspondance, deux
    // lignes de tarif resteraient en clair sur le contrat.
    const table = tableRemplacement(champs());
    expect(table["[CsSuppHT]"]).toBe("100.00");
    expect(table["[Tarifs.Tarif.CsSupp]"]).toBe("120.00");
  });

  it("met les dates au format francais", () => {
    const table = tableRemplacement(champs());
    expect(table["[DebutContrat]"]).toBe("01/07/2026");
    expect(table["[FinContrat]"]).toBe("30/06/2027");
    expect(table["[DateAG]"]).toBe("22/10/2026");
    expect(table["[Coproprietes.DateAssurance]"]).toBe("27/06/2023");
  });

  it("imprime 0 plutot que rien quand un compteur manque", () => {
    const sansParametres = { ...COPRO, finMaxAgHeure: null, dureeCsHeures: 0 };
    const tarifs = {} as Record<PrestationContrat, { libelle: string; ttc: number }>;
    for (const p of PRESTATIONS_CONTRAT) tarifs[p] = { libelle: p, ttc: 10 };
    const table = tableRemplacement(
      assemblerChampsContrat(
        sansParametres,
        {
          dateAgISO: "2026-10-22",
          debutISO: "2026-07-01",
          finISO: "2027-06-30",
          honorairesGestionTtc: 100,
          forfaitPostauxTtc: 0,
        },
        tarifs,
      ),
    );
    expect(table["[Coproprietes.FinMaxAG]"]).toBe("0");
    expect(table["[Coproprietes.DureeCS]"]).toBe("0");
  });
});

describe("remplirTexte", () => {
  const table = tableRemplacement(champs());

  it("remplace dans une phrase du contrat", () => {
    expect(
      remplirTexte("Il prendra effet le [DebutContrat] et prendra fin le [FinContrat].", table),
    ).toBe("Il prendra effet le 01/07/2026 et prendra fin le 30/06/2027.");
  });

  it("laisse VISIBLE un placeholder inconnu au lieu de creuser un trou", () => {
    expect(remplirTexte("Signe par [QuiDonc] le [DateAG].", table)).toBe(
      "Signe par [QuiDonc] le 22/10/2026.",
    );
    expect(placeholdersNonResolus("Signe par [QuiDonc].", table)).toEqual(["[QuiDonc]"]);
  });

  it("ne laisse AUCUN placeholder sur le gabarit entier", () => {
    const blocs = [...GABARIT_GAUCHE, ...GABARIT_DROITE].flatMap((b) =>
      typeof b === "string" ? [b] : [...b],
    );
    const restants = blocs.flatMap((b) => placeholdersNonResolus(b, table));
    expect([...new Set(restants)]).toEqual([]);
  });
});
