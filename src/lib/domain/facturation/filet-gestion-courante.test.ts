// Filet de securite de la gestion courante : seuils exacts, prorata aux bornes
// du trimestre, tolerance au centime, anti-doublon, contrat absent.

import { describe, expect, it } from "vitest";
import {
  attenduTrimestre,
  bornesTrimestre,
  motConfirmationValide,
  normaliserDateISO,
  prorataTrimestre,
  recapFournee,
  verdictLigne,
  type EntreeFilet,
} from "@/lib/domain/facturation/filet-gestion-courante";

/** Contrat de reference : 4 800 TTC/an + 400 de timbres/an.
 *  Trimestre plein = 4800/4/1,2 = 1 000 HT + 400/4 = 100 -> 1 100 HT. */
function entree(over: Partial<EntreeFilet> = {}): EntreeFilet {
  return {
    coproCode: "S010",
    honorairesAnnuelsTtc: 4800,
    forfaitPostauxAnnuel: 400,
    fraisPostauxReels: false,
    montantHt: 1100,
    dejaFacture: false,
    ...over,
  };
}

describe("bornesTrimestre", () => {
  it("donne les bornes et les jours REELS de chaque trimestre", () => {
    expect(bornesTrimestre("2026-T1")).toEqual({ debut: "2026-01-01", fin: "2026-03-31", jours: 90 });
    expect(bornesTrimestre("2026-T2")).toEqual({ debut: "2026-04-01", fin: "2026-06-30", jours: 91 });
    expect(bornesTrimestre("2026-T3")).toEqual({ debut: "2026-07-01", fin: "2026-09-30", jours: 92 });
    expect(bornesTrimestre("2026-T4")).toEqual({ debut: "2026-10-01", fin: "2026-12-31", jours: 92 });
  });

  it("annee bissextile : T1 fait 91 jours", () => {
    expect(bornesTrimestre("2028-T1").jours).toBe(91);
  });

  it("refuse une periode mal formee", () => {
    expect(() => bornesTrimestre("2026-T5")).toThrow(/Periode invalide/);
    expect(() => bornesTrimestre("2026-3")).toThrow(/Periode invalide/);
  });
});

describe("normaliserDateISO", () => {
  it("accepte une date ISO et un timestamp ISO", () => {
    expect(normaliserDateISO("2026-04-02")).toBe("2026-04-02");
    expect(normaliserDateISO("2026-04-02T00:00:00")).toBe("2026-04-02");
    expect(normaliserDateISO("  2026-04-02T00:00:00Z ")).toBe("2026-04-02");
  });

  it("refuse un libelle humain, une valeur vide ou absente", () => {
    // `priseEnGestion` du domaine est un libelle ("mars 2018") : jamais une date.
    expect(normaliserDateISO("mars 2018")).toBeNull();
    expect(normaliserDateISO("-")).toBeNull();
    expect(normaliserDateISO("")).toBeNull();
    expect(normaliserDateISO(null)).toBeNull();
    expect(normaliserDateISO(undefined)).toBeNull();
  });
});

describe("prorataTrimestre - bornes", () => {
  it("prise en gestion AVANT le trimestre : trimestre plein (pas de prorata)", () => {
    expect(prorataTrimestre("2026-T2", "2018-03-01")).toBeNull();
  });

  it("prise en gestion le PREMIER jour du trimestre : trimestre plein", () => {
    expect(prorataTrimestre("2026-T2", "2026-04-01")).toBeNull();
  });

  it("prise en gestion le DEUXIEME jour : 90 jours sur 91", () => {
    expect(prorataTrimestre("2026-T2", "2026-04-02")).toEqual({
      jours: 90,
      joursTrimestre: 91,
      ratio: 90 / 91,
    });
  });

  it("prise en gestion le DERNIER jour du trimestre : 1 jour", () => {
    expect(prorataTrimestre("2026-T2", "2026-06-30")).toEqual({
      jours: 1,
      joursTrimestre: 91,
      ratio: 1 / 91,
    });
  });

  it("prise en gestion APRES le trimestre : 0 jour", () => {
    expect(prorataTrimestre("2026-T2", "2026-07-01")).toEqual({
      jours: 0,
      joursTrimestre: 91,
      ratio: 0,
    });
  });

  it("date inconnue ou illisible : pas de prorata", () => {
    expect(prorataTrimestre("2026-T2", null)).toBeNull();
    expect(prorataTrimestre("2026-T2", "avril 2026")).toBeNull();
  });

  it("cas reel S301 (prise le 11/04/2026, T2) : 81 jours sur 91", () => {
    expect(prorataTrimestre("2026-T2", "2026-04-11T00:00:00")?.jours).toBe(81);
  });
});

describe("attenduTrimestre", () => {
  it("trimestre plein : annuel / 4, honoraires en HT, timbres tels quels", () => {
    const a = attenduTrimestre(
      { honorairesAnnuelsTtc: 4800, forfaitPostauxAnnuel: 400, fraisPostauxReels: false },
      "2026-T3",
    );
    expect(a.honorairesHt).toBeCloseTo(1000, 10);
    expect(a.timbres).toBe(100);
    expect(a.totalHt).toBeCloseTo(1100, 10);
    expect(a.totalPleinHt).toBeCloseTo(1100, 10);
    expect(a.prorata).toBeUndefined();
  });

  it("frais postaux reels : aucun forfait de timbres", () => {
    const a = attenduTrimestre(
      { honorairesAnnuelsTtc: 4800, forfaitPostauxAnnuel: 400, fraisPostauxReels: true },
      "2026-T3",
    );
    expect(a.timbres).toBe(0);
    expect(a.totalHt).toBeCloseTo(1000, 10);
  });

  it("prorata : honoraires ET timbres sont proratises, le plein reste expose", () => {
    const a = attenduTrimestre(
      {
        honorairesAnnuelsTtc: 4800,
        forfaitPostauxAnnuel: 400,
        fraisPostauxReels: false,
        priseEnGestion: "2026-04-11",
      },
      "2026-T2",
    );
    expect(a.prorata?.jours).toBe(81);
    expect(a.totalHt).toBeCloseTo(1100 * (81 / 91), 10);
    expect(a.totalPleinHt).toBeCloseTo(1100, 10);
  });

  it("contrat a 0 : attendu nul, pas d'exception", () => {
    const a = attenduTrimestre(
      { honorairesAnnuelsTtc: 0, forfaitPostauxAnnuel: 0, fraisPostauxReels: false },
      "2026-T3",
    );
    expect(a.totalHt).toBe(0);
  });
});

describe("verdictLigne - anti-doublon (regle 6)", () => {
  it("deja facturee : verdict deja_facturee, non emissible, non selectionnable", () => {
    const v = verdictLigne(
      entree({ dejaFacture: true, dejaFactureLe: "2026-07-02" }),
      "2026-T3",
    );
    expect(v.verdict).toBe("deja_facturee");
    expect(v.emissible).toBe(false);
    expect(v.selectionnableEnMasse).toBe(false);
    expect(v.selectionnableAvecAlertes).toBe(false);
    expect(v.dejaFactureLe).toBe("2026-07-02");
  });

  it("le doublon l'emporte meme sur une surfacturation majeure", () => {
    const v = verdictLigne(entree({ dejaFacture: true, montantHt: 99_999 }), "2026-T3");
    expect(v.verdict).toBe("deja_facturee");
    expect(v.exigeConfirmationEcrite).toBe(false);
  });
});

describe("verdictLigne - contrat absent ou a 0 (regle 7)", () => {
  it("honoraires null : contrat_absent, jamais emis", () => {
    const v = verdictLigne(entree({ honorairesAnnuelsTtc: null, montantHt: 0 }), "2026-T3");
    expect(v.verdict).toBe("contrat_absent");
    expect(v.emissible).toBe(false);
  });

  it("honoraires a 0 EUR : contrat_absent (ne part pas silencieusement a 0)", () => {
    const v = verdictLigne(
      entree({ honorairesAnnuelsTtc: 0, forfaitPostauxAnnuel: 0, montantHt: 0 }),
      "2026-T3",
    );
    expect(v.verdict).toBe("contrat_absent");
    expect(v.emissible).toBe(false);
    expect(v.selectionnableEnMasse).toBe(false);
  });
});

describe("verdictLigne - seuils exacts (regles 2, 3, 4)", () => {
  it("montant exactement egal a l'attendu : ok", () => {
    expect(verdictLigne(entree({ montantHt: 1100 }), "2026-T3").verdict).toBe("ok");
  });

  it("tolerance : 1 centime de moins reste ok, 2 centimes alertent", () => {
    expect(verdictLigne(entree({ montantHt: 1099.99 }), "2026-T3").verdict).toBe("ok");
    expect(verdictLigne(entree({ montantHt: 1099.98 }), "2026-T3").verdict).toBe(
      "sous_facturation",
    );
  });

  it("sous-facturation franche : alerte, mais validable a la main", () => {
    const v = verdictLigne(entree({ montantHt: 900 }), "2026-T3");
    expect(v.verdict).toBe("sous_facturation");
    expect(v.emissible).toBe(true);
    expect(v.selectionnableEnMasse).toBe(false); // jamais dans « tout selectionner »
    expect(v.selectionnableAvecAlertes).toBe(true);
    expect(v.exigeConfirmationEcrite).toBe(false);
    expect(v.ecartHt).toBeCloseTo(-200, 10);
    expect(v.ecartPct).toBeCloseTo(-200 / 1100, 10);
  });

  it("surfacturation sous +10 % : pas d'alerte (bande de tolerance assumee)", () => {
    // 1 100 -> 1 209,99 = +9,999 %
    expect(verdictLigne(entree({ montantHt: 1209.99 }), "2026-T3").verdict).toBe("ok");
  });

  it("EXACTEMENT +10 % : alerte orange (seuil inclusif)", () => {
    const v = verdictLigne(entree({ montantHt: 1210 }), "2026-T3");
    expect(v.verdict).toBe("alerte_10");
    expect(v.selectionnableEnMasse).toBe(false);
    expect(v.selectionnableAvecAlertes).toBe(true);
    expect(v.exigeConfirmationEcrite).toBe(false);
    expect(v.emissible).toBe(true);
  });

  it("+15 % : alerte orange", () => {
    expect(verdictLigne(entree({ montantHt: 1265 }), "2026-T3").verdict).toBe("alerte_10");
  });

  it("EXACTEMENT +20 % : encore orange, pas de confirmation ecrite", () => {
    const v = verdictLigne(entree({ montantHt: 1320 }), "2026-T3");
    expect(v.verdict).toBe("alerte_10");
    expect(v.exigeConfirmationEcrite).toBe(false);
  });

  it("un centime au-dessus de +20 % : confirmation dactylographiee exigee", () => {
    const v = verdictLigne(entree({ montantHt: 1320.01 }), "2026-T3");
    expect(v.verdict).toBe("alerte_20");
    expect(v.exigeConfirmationEcrite).toBe(true);
    expect(v.emissible).toBe(true); // pas un blocage : une confirmation
    expect(v.selectionnableEnMasse).toBe(false);
    expect(v.selectionnableAvecAlertes).toBe(false); // le geste « alertes » ne suffit pas
  });

  it("doublement du montant : alerte_20", () => {
    expect(verdictLigne(entree({ montantHt: 2200 }), "2026-T3").verdict).toBe("alerte_20");
  });
});

describe("verdictLigne - prorata (regle 5)", () => {
  it("montant au prorata : badge neutre `prorata`, aucune alerte", () => {
    const attendu = 1100 * (81 / 91);
    const v = verdictLigne(
      entree({ priseEnGestion: "2026-04-11T00:00:00", montantHt: attendu }),
      "2026-T2",
    );
    expect(v.verdict).toBe("prorata");
    expect(v.prorata?.jours).toBe(81);
    expect(v.selectionnableEnMasse).toBe(true); // « tout selectionner » la prend
    expect(v.emissible).toBe(true);
  });

  it("trimestre PLEIN facture sur une copro reprise en cours : surfacturation vue", () => {
    // 1 100 pour un attendu de 979,12 -> +12,3 % : le filet le voit.
    const v = verdictLigne(
      entree({ priseEnGestion: "2026-04-11", montantHt: 1100 }),
      "2026-T2",
    );
    expect(v.verdict).toBe("alerte_10");
    expect(v.prorata?.jours).toBe(81); // le badge prorata reste porte
  });

  it("prise en gestion apres le trimestre : attendu nul -> confirmation ecrite", () => {
    const v = verdictLigne(entree({ priseEnGestion: "2026-07-15", montantHt: 1100 }), "2026-T2");
    expect(v.verdict).toBe("alerte_20");
    expect(v.exigeConfirmationEcrite).toBe(true);
    expect(v.ecartPct).toBeNull(); // ratio indefini sur un attendu nul
  });

  it("prise en gestion apres le trimestre ET montant nul : ligne saine mais NON emise", () => {
    // 0 EUR du, 0 EUR propose : rien a facturer -> la ligne sort de la fournee
    // plutot que de creer une facture a 0 EUR chez Pennylane.
    const v = verdictLigne(entree({ priseEnGestion: "2026-07-15", montantHt: 0 }), "2026-T2");
    expect(v.verdict).toBe("prorata");
    expect(v.prorata?.jours).toBe(0);
    expect(v.emissible).toBe(false);
    expect(v.selectionnableEnMasse).toBe(false);
  });
});

describe("motConfirmationValide (regle 4)", () => {
  it("accepte le mot, insensible a la casse et aux espaces", () => {
    expect(motConfirmationValide("facturer")).toBe(true);
    expect(motConfirmationValide("FACTURER")).toBe(true);
    expect(motConfirmationValide("  Facturer  ")).toBe(true);
    expect(motConfirmationValide("fac turer")).toBe(true);
  });

  it("refuse tout le reste", () => {
    expect(motConfirmationValide("")).toBe(false);
    expect(motConfirmationValide("facture")).toBe(false);
    expect(motConfirmationValide("facturé")).toBe(false);
    expect(motConfirmationValide("oui")).toBe(false);
  });
});

describe("recapFournee (regle 8)", () => {
  it("agrege ce qui part, l'attendu, le trimestre plein et l'ecart", () => {
    const lignes = [
      verdictLigne(entree({ coproCode: "S001", montantHt: 1100 }), "2026-T2"),
      verdictLigne(
        entree({ coproCode: "S301", priseEnGestion: "2026-04-11", montantHt: 1100 * (81 / 91) }),
        "2026-T2",
      ),
    ];
    const r = recapFournee(lignes);
    expect(r.nbCopros).toBe(2);
    expect(r.totalHt).toBeCloseTo(1100 + 1100 * (81 / 91), 8);
    expect(r.totalAttenduHt).toBeCloseTo(r.totalHt, 8);
    expect(r.ecartHt).toBeCloseTo(0, 8);
    // Le trimestre PLEIN au contrat montre l'effet de la reprise : 2 200 EUR.
    expect(r.totalContratPleinHt).toBeCloseTo(2200, 8);
  });

  it("fournee vide : tout a zero", () => {
    expect(recapFournee([])).toEqual({
      nbCopros: 0,
      totalHt: 0,
      totalAttenduHt: 0,
      totalContratPleinHt: 0,
      ecartHt: 0,
    });
  });
});
