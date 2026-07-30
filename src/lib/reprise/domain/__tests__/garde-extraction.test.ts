// Garde-fou d'extraction (etape 1, etude §3bis). Le cas de reference est S0306 : une cle
// "ascenseur" de 38 lots sommant 38 000 pour un total annonce de 10 000, fabriquee par le
// modele sur un scan illisible. Elle ne doit plus ENTRER dans le jeu.

import { describe, expect, it } from "vitest";
import {
  appliquerGardeExtraction,
  compacterPlages,
  formaterPlages,
} from "@/lib/reprise/domain/garde-extraction";
import type { Cle, Lot, Tantieme } from "@/lib/reprise/domain/patrimoine";
import { prochaineEtape } from "@/lib/reprise/domain/prochaine-etape";

const lot = (numero: number): Lot => ({ numero, type: "Appartement", usage: "residential", commentaire: "x" });
const cle = (code: string, totalAttendu: number, libelle = "Charges"): Cle => ({ code, libelle, totalAttendu });
const t = (cleCode: string, l: number, valeur: number): Tantieme => ({ cleCode, lot: l, valeur });

/** 118 lots aux plages reelles de S0306. */
const LOTS_S0306: Lot[] = [
  ...Array.from({ length: 66 }, (_, i) => lot(i + 1)),
  ...Array.from({ length: 22 }, (_, i) => lot(101 + i)),
  ...Array.from({ length: 8 }, (_, i) => lot(201 + i)),
  ...Array.from({ length: 8 }, (_, i) => lot(301 + i)),
  ...Array.from({ length: 8 }, (_, i) => lot(401 + i)),
  ...Array.from({ length: 6 }, (_, i) => lot(501 + i)),
];

describe("compacterPlages / formaterPlages", () => {
  it("compacte des numeros non contigus", () => {
    expect(compacterPlages([3, 1, 2, 7, 8, 12])).toEqual([
      { debut: 1, fin: 3 },
      { debut: 7, fin: 8 },
      { debut: 12, fin: 12 },
    ]);
  });

  it("dedoublonne et tolere le desordre", () => {
    expect(compacterPlages([5, 5, 4, 6])).toEqual([{ debut: 4, fin: 6 }]);
    expect(compacterPlages([])).toEqual([]);
  });

  it("formate pour un mail : virgules puis 'et' final", () => {
    expect(formaterPlages([{ debut: 51, fin: 66 }])).toBe("51-66");
    expect(
      formaterPlages([
        { debut: 51, fin: 66 },
        { debut: 201, fin: 208 },
        { debut: 501, fin: 506 },
      ]),
    ).toBe("51-66, 201-208 et 501-506");
    expect(formaterPlages([{ debut: 7, fin: 7 }])).toBe("7");
  });
});

describe("appliquerGardeExtraction", () => {
  it("laisse passer une cle qui boucle exactement", () => {
    const lots = [lot(1), lot(2)];
    const r = appliquerGardeExtraction({
      lots,
      cles: [cle("001", 100)],
      tantiemes: [t("001", 1, 40), t("001", 2, 60)],
    });
    expect(r.refus).toHaveLength(0);
    expect(r.tantiemes).toHaveLength(2);
    expect(r.notes).toHaveLength(0);
  });

  it("laisse passer une cle qui ne concerne PAS tous les lots (cas legitime)", () => {
    // La cle 200 ascenseur de S0306 couvre 96 lots sur 118 : les 22 parkings/RDC sont
    // exclus a bon droit. Des lots absents ne sont un signal QUE si la somme ne tombe pas.
    const lots = [lot(1), lot(2), lot(101)];
    const r = appliquerGardeExtraction({
      lots,
      cles: [cle("200", 100, "Charges ascenseur")],
      tantiemes: [t("200", 1, 50), t("200", 2, 50)],
    });
    expect(r.refus).toHaveLength(0);
    expect(r.tantiemes).toHaveLength(2);
  });

  it("REFUSE la cle fabriquee de S0306 : 38 000 pour 10 000 annonces", () => {
    const tantiemes = Array.from({ length: 38 }, (_, i) => t("300", i + 1, 1000));
    const r = appliquerGardeExtraction({
      lots: LOTS_S0306,
      cles: [cle("300", 10_000, "Charges Ascenseur")],
      tantiemes,
    });
    expect(r.tantiemes).toHaveLength(0); // rien n'entre dans le jeu
    expect(r.refus).toHaveLength(1);
    const refus = r.refus[0]!;
    expect(refus.motif).toBe("somme_excedentaire");
    expect(refus.sommeCouverte).toBe(38_000);
    expect(refus.tantiemesRetires).toBe(38);
    expect(refus.message).toContain("38 000");
    expect(refus.message).toContain("10 000");
    expect(refus.message).toContain("Demander à l'ancien syndic");
  });

  it("produit le refus ACTIONNABLE de S0306 : plages manquantes exactes + demande de la page", () => {
    // Tableau tronque aux lots 1-50 : 2 800 / 10 000 (le cas qui a fait boucler la reprise
    // manuelle une fois la page obtenue).
    const tantiemes = Array.from({ length: 50 }, (_, i) => t("200", i + 1, 56));
    const r = appliquerGardeExtraction({
      lots: LOTS_S0306,
      cles: [cle("200", 10_000, "Charges ascenseur")],
      tantiemes,
    });
    const refus = r.refus[0]!;
    expect(refus.motif).toBe("tableau_incomplet");
    expect(refus.sommeCouverte).toBe(2_800);
    expect(refus.plagesCouvertes).toEqual([{ debut: 1, fin: 50 }]);
    // Les plages manquantes sont CALCULEES : c'est ce qui rend la demande precise.
    expect(formaterPlages(refus.plagesManquantes)).toBe(
      "51-66, 101-122, 201-208, 301-308, 401-408 et 501-506",
    );
    expect(refus.message).toContain("ne couvre que les lots 1-50");
    expect(refus.message).toContain("51-66");
    expect(refus.message).toContain("la page suivante du tableau de répartition");
  });

  it("refuse une cle sans aucun tantieme (scan illisible) sans punir les autres cles", () => {
    const lots = [lot(1), lot(2)];
    const r = appliquerGardeExtraction({
      lots,
      cles: [cle("001", 100), cle("200", 10_000, "Ascenseur")],
      tantiemes: [t("001", 1, 40), t("001", 2, 60)],
    });
    expect(r.refus).toHaveLength(1);
    expect(r.refus[0]!.motif).toBe("aucun_tantieme");
    // La cle qui boucle survit intacte : une cle fausse n'invalide pas une cle juste.
    expect(r.tantiemes).toEqual([t("001", 1, 40), t("001", 2, 60)]);
    expect(r.cles).toHaveLength(2); // la cle refusee garde sa place (et son total)
  });

  it("refuse un total non exploitable : un budget ou un volume n'est pas un total de tantiemes", () => {
    // Cause 1 de S0306 : totalAttendu rempli avec des m3 d'eau ou un budget.
    for (const total of [0, -5, Number.NaN]) {
      const r = appliquerGardeExtraction({
        lots: [lot(1)],
        cles: [cle("998", total, "Conso privative")],
        tantiemes: [t("998", 1, 1120)],
      });
      expect(r.refus[0]!.motif).toBe("total_invalide");
      expect(r.tantiemes).toHaveLength(0);
      expect(r.refus[0]!.message).toContain("ne peuvent pas être vérifiés");
    }
  });

  it("distingue une somme insuffisante d'un tableau tronque", () => {
    // Tous les lots couverts, mais une valeur fausse -> pas de page a demander.
    const r = appliquerGardeExtraction({
      lots: [lot(1), lot(2)],
      cles: [cle("001", 100)],
      tantiemes: [t("001", 1, 40), t("001", 2, 55)],
    });
    expect(r.refus[0]!.motif).toBe("somme_insuffisante");
    expect(r.refus[0]!.plagesManquantes).toEqual([]);
    expect(r.refus[0]!.message).toContain("valeurs sont donc fausses");
    expect(r.refus[0]!.message).not.toContain("page suivante");
  });

  it("signale les lots inexistants dans l'EDD (numero mal transcrit, le cas '204')", () => {
    const r = appliquerGardeExtraction({
      lots: [lot(1), lot(2)],
      cles: [cle("001", 100)],
      tantiemes: [t("001", 1, 40), t("001", 2, 60), t("001", 204, 0)],
    });
    expect(r.refus).toHaveLength(1); // la somme tombe pourtant juste : le lot inconnu suffit
    expect(r.refus[0]!.lotsInconnus).toEqual([204]);
    expect(r.refus[0]!.message).toContain("lots inexistants dans l'EDD : 204");
    expect(r.tantiemes).toHaveLength(0);
  });

  it("retire les tantiemes orphelins sans emettre de refus de cle", () => {
    const r = appliquerGardeExtraction({
      lots: [lot(1)],
      cles: [cle("001", 10)],
      tantiemes: [t("001", 1, 10), t("999", 1, 5)],
    });
    expect(r.refus).toHaveLength(0); // pas une cle refusee : une ligne sans cle
    expect(r.tantiemes).toEqual([t("001", 1, 10)]);
  });

  it("distingue un FACTEUR D'ECHELLE d'une valeur fausse (revue 30/07)", () => {
    // Σ = 100 000 pour 10 000 attendus : on a lu la base des charges GENERALES a la place de
    // celle de l'ascenseur. La piece est la, c'est la colonne qui est mauvaise -> on ne
    // demande AUCUNE page (une demande inutile brule du credit aupres de l'ancien syndic).
    const tantiemes = Array.from({ length: 10 }, (_, i) => t("200", i + 1, 10_000));
    const r = appliquerGardeExtraction({
      lots: LOTS_S0306,
      cles: [cle("200", 10_000, "Charges ascenseur")],
      tantiemes,
    });
    expect(r.refus[0]!.motif).toBe("facteur_echelle");
    expect(r.refus[0]!.message).toContain("10 fois trop grande");
    expect(r.refus[0]!.message).toContain("MAUVAISE COLONNE");
    expect(r.refus[0]!.message).not.toContain("page suivante");
    expect(r.refus[0]!.message).toContain("colonne voisine");
  });

  it("le facteur d'echelle marche aussi dans l'autre sens (colonne trop petite)", () => {
    const r = appliquerGardeExtraction({
      lots: [lot(1), lot(2)],
      cles: [cle("001", 100_000)],
      tantiemes: [t("001", 1, 5_000), t("001", 2, 5_000)], // 10 000 pour 100 000
    });
    expect(r.refus[0]!.motif).toBe("facteur_echelle");
    expect(r.refus[0]!.message).toContain("10 fois trop petite");
  });

  it("un ecart qui n'est PAS un facteur d'echelle reste un exces ordinaire (cle 300 : 38 000/10 000)", () => {
    // 3,8x n'est pas un facteur d'echelle : c'est bien une fabrication de valeurs.
    const tantiemes = Array.from({ length: 38 }, (_, i) => t("300", i + 1, 1000));
    const r = appliquerGardeExtraction({
      lots: LOTS_S0306,
      cles: [cle("300", 10_000, "Charges Ascenseur")],
      tantiemes,
    });
    expect(r.refus[0]!.motif).toBe("somme_excedentaire");
  });

  it("les notes ne portent que des codes et des nombres, jamais de PII", () => {
    const r = appliquerGardeExtraction({
      lots: [lot(1)],
      cles: [cle("200", 10_000, "Ascenseur")],
      tantiemes: [],
    });
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toBe(r.refus[0]!.message);
  });
});

describe("prochaine etape : le refus passe AVANT le renvoi generique", () => {
  it("affiche la demande a l'ancien syndic plutot que 'ouvre l'editeur'", () => {
    const base = {
      jeuPresent: true,
      pretAProduire: false,
      comptaErreur: false,
      avantRepartitionBloquant: false,
      raccordementKO: false,
      dejaInjecte: false,
      auMoinsUneFicheGeneree: false,
      comptaEnCoursPresente: false,
      revueMappingFaite: false,
      importComptaFait: false,
    } as Parameters<typeof prochaineEtape>[0];

    // Sans refus : le renvoi generique vers l'editeur (comportement historique, inchange).
    expect(prochaineEtape(base).titre).toBe("Corrige les erreurs bloquantes");

    // Avec refus : la demande PRECISE prend la main -- un tableau tronque ne se corrige
    // pas a la main, il se redemande.
    const avecRefus = prochaineEtape({
      ...base,
      refusExtraction: { cleCode: "200", message: "Manquent les lots 51-66. Demander la page suivante." },
    });
    expect(avecRefus.titre).toContain("cle 200");
    expect(avecRefus.description).toContain("51-66");
    expect(avecRefus.description).toContain("Demander");
  });
});
