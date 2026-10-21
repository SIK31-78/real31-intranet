// Le cycle reproduit une regle du legacy qui SEMBLE fausse et ne l'est pas :
// le nouveau contrat commence le lendemain de la fin du precedent, mais se termine
// un an apres cette fin - donc il dure ~364 jours. C'est l'arrondi de
// `calculerDureeContrat` qui rattrape, et le document affiche bien « 1 an ».
// Ces tests verrouillent le couple, sinon quelqu'un « corrigera » le decalage un jour
// et tous les contrats imprimes changeront.

import { describe, expect, it } from "vitest";
import { alertesDatesContrat, cycleSuivant, finContratAvantAg, finContratEnCours, finDeCycle, motifRefusCycle } from "./cycle-contrat";
import { dureeContratTexte } from "./duree-contrat";

describe("cycleSuivant", () => {
  it("enchaine sur le lendemain et finit un an apres la fin precedente", () => {
    expect(cycleSuivant("2026-06-30")).toEqual({ debut: "2026-07-01", fin: "2027-06-30" });
  });

  it("le cycle ainsi calcule s'affiche bien « 1 an » (l'arrondi rattrape les 364 jours)", () => {
    const { debut, fin } = cycleSuivant("2026-06-30");
    expect(dureeContratTexte(debut, fin)).toBe("1 an, 0 mois, 0 jour");
  });

  it("passe une fin d'annee civile", () => {
    expect(cycleSuivant("2026-12-31")).toEqual({ debut: "2027-01-01", fin: "2027-12-31" });
  });

  it("traverse un 29 fevrier sans deborder sur mars", () => {
    // 2028 est bissextile : la fin tombe pile sur le 29.
    expect(cycleSuivant("2027-02-28")).toEqual({ debut: "2027-03-01", fin: "2028-02-28" });
  });

  it("ramene un 29 fevrier au 28 quand l'annee d'arrivee n'est pas bissextile", () => {
    // Sans garde, setUTCFullYear ferait glisser au 01/03/2029 : une date de fin que
    // le gestionnaire ne reconnaitrait pas.
    expect(cycleSuivant("2028-02-29")).toEqual({ debut: "2028-03-01", fin: "2029-02-28" });
  });

  it("refuse une date illisible plutot que de produire un contrat de travers", () => {
    expect(() => cycleSuivant("30/06/2026")).toThrow(/illisible/);
    expect(() => cycleSuivant("")).toThrow(/illisible/);
  });
});

describe("finDeCycle", () => {
  it("est l'exact inverse de cycleSuivant", () => {
    const { debut, fin } = cycleSuivant("2026-06-30");
    expect(finDeCycle(debut)).toBe(fin);
  });

  it("ramene un 29 fevrier au 28 quand l'annee d'arrivee n'est pas bissextile", () => {
    expect(finDeCycle("2028-03-01")).toBe("2029-02-28");
  });

  it("refuse une date illisible", () => {
    expect(() => finDeCycle("01/07/2026")).toThrow(/illisible/);
  });

  // Durees libres (Sekou, 14/09/2026) : 2 ans, ou 15 mois pour une reprise.
  it("calcule une fin a 2 ans et a 15 mois", () => {
    expect(finDeCycle("2026-07-01", 24)).toBe("2028-06-30");
    expect(finDeCycle("2026-04-01", 15)).toBe("2027-06-30");
  });

  it("ramene au dernier jour du mois quand le jour n'existe pas a l'arrivee", () => {
    // 31/01 + 1 mois = « 31/02 » -> 28/02, moins un jour -> 27/02.
    expect(finDeCycle("2026-01-31", 1)).toBe("2026-02-27");
    // 31/03 + 15 mois = 31/06 inexistant -> 30/06, moins un jour -> 29/06.
    expect(finDeCycle("2026-03-31", 15)).toBe("2027-06-29");
  });

  it("le document affiche la duree reelle : « 2 ans » et « 1 an, 3 mois »", () => {
    expect(dureeContratTexte("2026-07-01", finDeCycle("2026-07-01", 24))).toBe("2 ans, 0 mois, 0 jour");
    expect(dureeContratTexte("2026-04-01", finDeCycle("2026-04-01", 15))).toBe("1 an, 3 mois, 0 jour");
  });
});

describe("motifRefusCycle", () => {
  it("accepte 1 an, 2 ans, 15 mois et pile 3 ans", () => {
    expect(motifRefusCycle("2026-07-01", "2027-06-30")).toBeNull();
    expect(motifRefusCycle("2026-07-01", "2028-06-30")).toBeNull();
    expect(motifRefusCycle("2026-04-01", "2027-06-30")).toBeNull();
    expect(motifRefusCycle("2026-07-01", "2029-06-30")).toBeNull();
  });

  it("refuse plus de trois ans (maximum legal d'un mandat)", () => {
    expect(motifRefusCycle("2026-07-01", "2029-07-01")).toMatch(/trois ans/);
  });

  it("refuse une fin qui ne suit pas le debut", () => {
    expect(motifRefusCycle("2026-07-01", "2026-07-01")).toMatch(/après le début/);
    expect(motifRefusCycle("2026-07-01", "2026-06-30")).toMatch(/après le début/);
  });
});

// LE test qui vient d'un vrai constat terrain : Sekou, 2026-09-11, « 31 FOCH n'est pas
// echu car nous avons signe le contrat ». App A portait encore une fin au 30/06/2026
// alors que l'intranet avait enregistre un cycle demarre le 01/07/2026.
describe("finContratEnCours", () => {
  const cycle = (debutISO: string, extra: Partial<{ finISO: string; enregistreLeISO: string }> = {}) => ({ debutISO, ...extra });

  it("prefere le cycle enregistre par l'intranet quand le referentiel a pris du retard", () => {
    // Le cas FOCH31 exactement.
    expect(finContratEnCours("2026-06-30", cycle("2026-07-01", { enregistreLeISO: "2026-07-22" }))).toBe("2027-06-30");
  });

  it("garde le referentiel quand c'est LUI le plus a jour", () => {
    expect(finContratEnCours("2027-06-30", cycle("2025-06-01", { enregistreLeISO: "2026-07-22" }))).toBe("2027-06-30");
  });

  it("BARRILLET1 : un mandat renouvele AVANT terme compte (nouveau contrat au 01/01, fin App A au 30/06)", () => {
    expect(finContratEnCours("2026-06-30", cycle("2026-01-01", { enregistreLeISO: "2026-07-22" }))).toBe("2026-12-31");
  });

  it("34 GAUTHEY : le cycle de bascule du 01/10/2025 ne masque pas la fin du referentiel", () => {
    // Mandat fini le 30/10/2025, aucune AG depuis la reprise ; le suivi ne porte que la
    // ligne d'import. Sans cette regle : « jusqu'au 30/09/2026 », 320 jours de silence.
    expect(finContratEnCours("2025-10-30", cycle("2025-10-01", { enregistreLeISO: "2026-07-22" }))).toBe("2025-10-30");
  });

  it("un cycle qui commence un 01/10/2025 mais saisi par un recap n'est PAS la bascule", () => {
    expect(finContratEnCours("2025-10-30", cycle("2025-10-01", { enregistreLeISO: "2025-09-20" }))).toBe("2026-09-30");
  });

  it("prefere la fin STOCKEE du cycle a la fin deduite (contrat de 2 ans)", () => {
    expect(finContratEnCours("2026-06-30", cycle("2026-07-01", { finISO: "2028-06-30", enregistreLeISO: "2026-09-15" }))).toBe("2028-06-30");
  });

  it("se contente de ce qu'il a quand une source manque", () => {
    expect(finContratEnCours("2026-06-30", null)).toBe("2026-06-30");
    expect(finContratEnCours(null, cycle("2026-01-01"))).toBe("2026-12-31");
  });

  it("renvoie null quand aucune source ne dit rien (la copro sort de la liste)", () => {
    expect(finContratEnCours(null, null)).toBeNull();
    expect(finContratEnCours(undefined, undefined)).toBeNull();
  });

  it("ignore une date de referentiel illisible plutot que de la comparer de travers", () => {
    expect(finContratEnCours("30/06/2026", cycle("2026-07-01"))).toBe("2027-06-30");
  });
});

// Les cas reels releves le 21/10/2026 (base de prod) : S111 Villa La Croix et S065 ont ete
// edites un an trop tard apres le recap ; S003 et S232 sont justes malgre un App A perime.
describe("finContratAvantAg", () => {
  const bascule = { debutISO: "2025-10-01", finISO: null, enregistreLeISO: "2026-07-22" };
  const s111 = [{ debutISO: "2026-10-01", finISO: "2027-09-30", enregistreLeISO: "2026-10-01" }, bascule];

  it("ecarte le cycle que le recap de cette AG a deja enregistre (S111)", () => {
    expect(finContratAvantAg("2026-09-30", s111, "2026-09-29")).toBe("2026-09-30");
    // Avant le correctif : la fin du dernier cycle, donc un debut au 01/10/2027.
    expect(finContratEnCours("2026-09-30", s111[0])).toBe("2027-09-30");
  });
  it("mandat retroactif : le cycle enregistre apres l'AG est ecarte meme s'il commence avant", () => {
    const cycles = [{ debutISO: "2026-10-01", finISO: "2027-09-30", enregistreLeISO: "2026-10-20" }];
    expect(finContratAvantAg("2026-09-30", cycles, "2026-10-19")).toBe("2026-09-30");
  });
  it("App A mis a jour apres l'AG : sa fin est celle du cycle ecarte, elle ne compte pas", () => {
    expect(finContratAvantAg("2027-09-30", s111, "2026-09-29")).toBeNull();
  });
  it("App A perime : le cycle enregistre avant l'AG fait foi (S003, S232)", () => {
    expect(finContratAvantAg("2025-12-31", [{ debutISO: "2026-01-01", finISO: null, enregistreLeISO: "2026-07-22" }], "2026-11-03")).toBe("2026-12-31");
    expect(finContratAvantAg("2026-01-16", [{ debutISO: "2026-01-17", finISO: "2027-01-16", enregistreLeISO: "2026-07-22" }], "2026-09-23")).toBe("2027-01-16");
  });
  it("sans date d'AG : tout ce qui est connu compte", () => {
    expect(finContratAvantAg("2026-09-30", s111, undefined)).toBe("2027-09-30");
  });
});

describe("alertesDatesContrat", () => {
  const reperes = { finReferentielISO: "2026-09-30", cycles: [{ debutISO: "2026-10-01", finISO: "2027-09-30", enregistreLeISO: "2026-10-01" }] };

  it("alerte sur la date de Villa La Croix, pas sur la bonne", () => {
    expect(alertesDatesContrat({ dateAgISO: "2026-09-29", debutISO: "2027-10-01" }, reperes, "2026-10-03")).toEqual([
      "le contrat précédent finit le 30/09/2026 : le nouveau devrait prendre effet le 01/10/2026, pas le 01/10/2027. À vérifier avant d'éditer.",
    ]);
    expect(alertesDatesContrat({ dateAgISO: "2026-09-29", debutISO: "2026-10-01" }, reperes, "2026-10-03")).toEqual([]);
  });
  it("un renouvellement anticipe (debut avant le lendemain) n'alerte pas", () => {
    expect(alertesDatesContrat({ dateAgISO: "2026-06-15", debutISO: "2026-07-01" }, reperes, "2026-06-20")).toEqual([]);
  });
  it("alerte sur une AG de plus de 6 mois (S111, AG du 24/06/2025 pre-remplie le 29/09/2026)", () => {
    const [a] = alertesDatesContrat({ dateAgISO: "2025-06-24", debutISO: "2026-10-01" }, { finReferentielISO: "2026-09-30", cycles: [] }, "2026-09-29");
    expect(a).toBe("l'assemblée du 24/06/2025 date de plus de 6 mois : le barème appliqué sera celui de 2025. Vérifier la date.");
    expect(alertesDatesContrat({ dateAgISO: "2026-04-01", debutISO: "2026-10-01" }, { finReferentielISO: "2026-09-30", cycles: [] }, "2026-09-30")).toEqual([]);
  });
});
