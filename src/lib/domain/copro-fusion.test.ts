// Tests de la logique PURE de fusion copro (miroir Crypto + eStale live). Zero I/O.

import { describe, it, expect } from "vitest";
import type { Copropriete } from "@/lib/domain/copropriete";
import {
  appliquerDates,
  datesDepuisTimestamps,
  datesDuMiroir,
  fusionnerCopros,
  fusionnerDates,
  normaliserRef,
} from "@/lib/domain/copro-fusion";

function copro(partial: Partial<Copropriete> & { code: string }): Copropriete {
  return {
    source: "crypto",
    nom: "Test",
    adresse: { ligne1: "1 rue", codePostal: "31000", ville: "Toulouse" },
    statut: "active",
    lotsPrincipaux: 0,
    lotsAutres: 0,
    exercice: { debut: "-", fin: "-" },
    priseEnGestion: "-",
    equipe: [],
    ...partial,
  };
}

describe("normaliserRef", () => {
  it("retire les zeros de tete apres le prefixe", () => {
    expect(normaliserRef("S0300")).toBe("S300");
    expect(normaliserRef(" s0299 ")).toBe("S299");
    expect(normaliserRef("SE999")).toBe("SE999");
    expect(normaliserRef("S300")).toBe("S300");
  });
});

describe("datesDepuisTimestamps", () => {
  it("separe jour et heure (next = timestamptz, last = date pure)", () => {
    const d = datesDepuisTimestamps({
      next_ag_date: "2026-09-07T18:00:00",
      next_cs_date: "2026-08-05T00:00:00",
      last_ag_date: "2026-04-02",
      last_cs_date: null,
    });
    expect(d.prochaineAgDate).toBe("2026-09-07");
    expect(d.prochaineAgHeure).toBe("18:00");
    expect(d.prochaineCsDate).toBe("2026-08-05");
    expect(d.prochaineCsHeure).toBeUndefined(); // minuit -> pas d'heure
    expect(d.derniereAgDate).toBe("2026-04-02");
    expect(d.derniereCsDate).toBeUndefined();
  });
});

describe("fusionnerDates (intranet prioritaire, repli miroir)", () => {
  it("intranet ecrase le miroir pour la prochaine AG (jour + heure ensemble)", () => {
    const intranet = { prochaineAgDate: "2026-10-01", prochaineAgHeure: "14:00" };
    const miroir = { prochaineAgDate: "2027-06-30", derniereAgDate: "2026-04-02" };
    const d = fusionnerDates(intranet, miroir);
    expect(d.prochaineAgDate).toBe("2026-10-01");
    expect(d.prochaineAgHeure).toBe("14:00");
    expect(d.derniereAgDate).toBe("2026-04-02"); // absent d'intranet -> repli miroir
  });

  it("repli complet sur le miroir quand AUCUNE ligne intranet (null)", () => {
    const miroir = { prochaineAgDate: "2027-06-30", derniereAgDate: "2026-04-02" };
    expect(fusionnerDates(null, miroir)).toEqual(miroir);
    expect(fusionnerDates({}, {})).toEqual({});
  });

  // Bug Sekou 2026-07-28 : effacer une date la faisait REAPPARAITRE (repli miroir).
  it("EFFACEMENT : ligne intranet existante (meme vide) -> plus de repli sur les PROCHAINES dates", () => {
    const miroir = {
      prochaineAgDate: "2027-06-30",
      prochaineCsDate: "2027-05-05",
      derniereAgDate: "2026-04-02",
    };
    // Ligne native existante mais vidée (l'utilisateur a efface AG et CS).
    const d = fusionnerDates({}, miroir);
    expect(d.prochaineAgDate).toBeUndefined();
    expect(d.prochaineCsDate).toBeUndefined();
    // La derniere AG tenue garde son repli miroir (elle ne s'efface pas dans ce geste).
    expect(d.derniereAgDate).toBe("2026-04-02");
  });

  it("EFFACEMENT partiel : AG posee dans l'intranet, CS effacee -> la CS miroir ne revient pas", () => {
    const d = fusionnerDates(
      { prochaineAgDate: "2026-12-01" },
      { prochaineAgDate: "2027-06-30", prochaineCsDate: "2027-05-05" },
    );
    expect(d.prochaineAgDate).toBe("2026-12-01");
    expect(d.prochaineCsDate).toBeUndefined();
  });
});

describe("appliquerDates", () => {
  it("reconstruit ProchaineAg avec le supervisionId CODE__DATE", () => {
    const c = appliquerDates(copro({ code: "S300", source: "estale" }), {
      prochaineAgDate: "2027-06-30",
      derniereAgDate: "2026-04-02",
    });
    expect(c.prochaineAg).toEqual({
      date: "2027-06-30",
      statut: "planifiee",
      supervisionId: "S300__2027-06-30",
    });
    expect(c.derniereAgDate).toBe("2026-04-02");
  });
});

describe("datesDuMiroir", () => {
  it("extrait les dates d'une ligne miroir, {} si null", () => {
    expect(datesDuMiroir(null)).toEqual({});
    const c = copro({
      code: "S300",
      prochaineAg: { date: "2027-06-30", statut: "planifiee" },
      derniereAgDate: "2026-04-02",
    });
    expect(datesDuMiroir(c)).toEqual({ prochaineAgDate: "2027-06-30", derniereAgDate: "2026-04-02" });
  });
});

describe("fusionnerCopros (dedup + cloisonnement)", () => {
  const crypto = [
    copro({ code: "S104", source: "crypto" }),
    copro({ code: "S300", source: "estale" }), // ligne miroir d'une copro eStale
  ];
  const estale = [
    copro({ code: "S300", source: "estale", managerId: "u-mahaut" }),
    copro({ code: "S297", source: "estale" }), // orpheline, pas de managerId
    copro({ code: "S299", source: "estale", managerId: "u-mathilde", assistantId: "u-asst" }),
  ];

  it("dedup : la ligne miroir eStale est retiree, la version eStale fait foi", () => {
    const res = fusionnerCopros({ crypto, estale });
    const codes = res.map((c) => c.code).sort();
    expect(codes).toEqual(["S104", "S297", "S299", "S300"]);
    // Une seule S300, et c'est celle du provider (managerId resolu).
    const s300 = res.filter((c) => c.code === "S300");
    expect(s300).toHaveLength(1);
    expect(s300[0].managerId).toBe("u-mahaut");
  });

  it("cloisonnement managerId : ne garde que les copros eStale du gestionnaire/assistant", () => {
    const res = fusionnerCopros({ crypto, estale, managerId: "u-mathilde" });
    const codes = res.map((c) => c.code).sort();
    // S104 (crypto, deja cloisonne en amont) + S299 (mathilde). Pas S300 (mahaut), pas S297.
    expect(codes).toEqual(["S104", "S299"]);
  });

  it("cloisonnement par assistant aussi", () => {
    const res = fusionnerCopros({ crypto: [], estale, managerId: "u-asst" });
    expect(res.map((c) => c.code)).toEqual(["S299"]);
  });

  it("vue transverse (sans managerId) : toutes les copros eStale, orpheline comprise", () => {
    const res = fusionnerCopros({ crypto: [], estale });
    expect(res.map((c) => c.code).sort()).toEqual(["S297", "S299", "S300"]);
  });
});
