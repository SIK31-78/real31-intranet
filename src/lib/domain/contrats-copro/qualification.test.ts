import { describe, expect, it } from "vitest";
import { plusJours } from "./dates";
import {
  debutFenetre,
  derniereEtapeIntermediaireISO,
  estACompleterActif,
  estCycleADemarrer,
  joursSansAvancement,
  niveauCycle,
  pireNiveau,
  progression,
} from "./qualification";
import type { Cycle, RegleRelance } from "./types";

const AUJ = "2026-05-17";
const REGLE: RegleRelance = { sujet: "assurance", premierRappelJours: 180, orangeJours: 30, rougeJours: 60, cadenceJours: 7 };

/** L'échéance telle que la fenêtre soit ouverte depuis `jours` jours (négatif = pas encore ouverte). */
function echeancePourFenetreOuverteDepuis(jours: number): string {
  return plusJours(AUJ, REGLE.premierRappelJours - jours);
}

function ilYA(jours: number): string {
  return plusJours(AUJ, -jours);
}

function cycle(over: Partial<Cycle> = {}): Cycle {
  return {
    id: "c1",
    sujet: "assurance",
    coproCode: "S0247",
    statut: "en_cours",
    echeanceISO: echeancePourFenetreOuverteDepuis(10),
    etapes: {},
    demarreManuellement: null,
    creeLeISO: "2026-01-01",
    ...over,
  };
}

describe("debutFenetre", () => {
  it("ouvre la fenêtre à échéance moins le premier rappel", () => {
    expect(debutFenetre("2027-03-01", REGLE)).toBe("2026-09-02");
    expect(debutFenetre("2027-03-01", { ...REGLE, premierRappelJours: 90 })).toBe("2026-12-01");
  });
});

describe("derniereEtapeIntermediaireISO", () => {
  it("prend la plus récente des intermédiaires, ignore terminale et post-terminales", () => {
    expect(derniereEtapeIntermediaireISO("assurance", { sinistralite_demandee: "2026-01-10", offres_demandees: "2026-02-20", validee: "2026-04-01" })).toBe("2026-02-20");
    expect(derniereEtapeIntermediaireISO("ctq_ascenseur", { devis_valide: "2026-02-01", ctq_realise: "2026-03-01", transmis_entreprise: "2026-03-15" })).toBe("2026-02-01");
    expect(derniereEtapeIntermediaireISO("gaz", {})).toBeNull();
    expect(derniereEtapeIntermediaireISO("gaz", { validee: "2026-03-01" })).toBeNull();
  });
});

describe("niveauCycle : rouge = dossier figé, pas échéance imminente", () => {
  it("échéance nulle : à compléter, jamais vert par défaut", () => {
    expect(niveauCycle(cycle({ echeanceISO: null }), REGLE, AUJ)).toBe("a_completer");
  });

  it("fenêtre pas encore ouverte : vert", () => {
    expect(niveauCycle(cycle({ echeanceISO: echeancePourFenetreOuverteDepuis(-20) }), REGLE, AUJ)).toBe("vert");
    expect(joursSansAvancement(cycle({ echeanceISO: echeancePourFenetreOuverteDepuis(-20) }), REGLE, AUJ)).toBeNull();
  });

  it("fenêtre ouverte depuis 45 jours sans étape : orange", () => {
    const c = cycle({ echeanceISO: echeancePourFenetreOuverteDepuis(45) });
    expect(niveauCycle(c, REGLE, AUJ)).toBe("orange");
    expect(joursSansAvancement(c, REGLE, AUJ)).toBe(45);
  });

  it("fenêtre ouverte depuis 61 jours sans étape : rouge", () => {
    expect(niveauCycle(cycle({ echeanceISO: echeancePourFenetreOuverteDepuis(61) }), REGLE, AUJ)).toBe("rouge");
  });

  it("les seuils sont inclusifs : 30 jours = orange, 60 jours = rouge, 29 = vert", () => {
    expect(niveauCycle(cycle({ echeanceISO: echeancePourFenetreOuverteDepuis(29) }), REGLE, AUJ)).toBe("vert");
    expect(niveauCycle(cycle({ echeanceISO: echeancePourFenetreOuverteDepuis(30) }), REGLE, AUJ)).toBe("orange");
    expect(niveauCycle(cycle({ echeanceISO: echeancePourFenetreOuverteDepuis(60) }), REGLE, AUJ)).toBe("rouge");
  });

  it("une étape datée hier après 70 jours de fenêtre : vert (le compteur repart)", () => {
    const c = cycle({ echeanceISO: echeancePourFenetreOuverteDepuis(70), etapes: { offres_demandees: ilYA(1) } });
    expect(niveauCycle(c, REGLE, AUJ)).toBe("vert");
    expect(joursSansAvancement(c, REGLE, AUJ)).toBe(1);
  });

  it("échéance dans 5 jours mais progression il y a 10 jours : vert", () => {
    expect(niveauCycle(cycle({ echeanceISO: plusJours(AUJ, 5), etapes: { offres_recues: ilYA(10) } }), REGLE, AUJ)).toBe("vert");
  });

  it("une étape antérieure à l'ouverture de la fenêtre ne compte pas", () => {
    expect(niveauCycle(cycle({ echeanceISO: echeancePourFenetreOuverteDepuis(70), etapes: { sinistralite_demandee: ilYA(300) } }), REGLE, AUJ)).toBe("rouge");
  });

  it("la terminale datée ne remet pas le compteur à zéro", () => {
    expect(niveauCycle(cycle({ echeanceISO: echeancePourFenetreOuverteDepuis(70), etapes: { validee: ilYA(1) } }), REGLE, AUJ)).toBe("rouge");
  });

  it("une post-terminale CTQ ne remet pas le compteur à zéro non plus", () => {
    const c = cycle({ sujet: "ctq_ascenseur", echeanceISO: echeancePourFenetreOuverteDepuis(70), etapes: { transmis_entreprise: ilYA(1) } });
    expect(niveauCycle(c, { ...REGLE, sujet: "ctq_ascenseur" }, AUJ)).toBe("rouge");
  });

  it("la date du jour est un paramètre : même cycle, deux jours, deux niveaux", () => {
    const c = cycle({ echeanceISO: echeancePourFenetreOuverteDepuis(20) });
    expect(niveauCycle(c, REGLE, AUJ)).toBe("vert");
    expect(niveauCycle(c, REGLE, plusJours(AUJ, 45))).toBe("rouge");
  });
});

describe("pireNiveau", () => {
  it("rouge > orange > vert, « à compléter » ignoré, null si rien de qualifiable", () => {
    expect(pireNiveau(["vert", "rouge", "orange"])).toBe("rouge");
    expect(pireNiveau(["vert", "orange", "vert"])).toBe("orange");
    expect(pireNiveau(["vert", "vert"])).toBe("vert");
    expect(pireNiveau(["a_completer", "rouge", "a_completer"])).toBe("rouge");
    expect(pireNiveau(["a_completer", "vert"])).toBe("vert");
    expect(pireNiveau([])).toBeNull();
    expect(pireNiveau(["a_completer", "a_completer"])).toBeNull();
  });
});

describe("estACompleterActif", () => {
  it("sans échéance ET en cours seulement", () => {
    expect(estACompleterActif({ echeanceISO: null, statut: "en_cours" })).toBe(true);
    expect(estACompleterActif({ echeanceISO: null, statut: "archive" })).toBe(false);
    expect(estACompleterActif({ echeanceISO: null, statut: "clos" })).toBe(false);
    expect(estACompleterActif({ echeanceISO: "2027-01-01", statut: "en_cours" })).toBe(false);
  });
});

describe("estCycleADemarrer", () => {
  it("en cours, pas démarré à la main, rien de daté, aucune activité", () => {
    expect(estCycleADemarrer(cycle(), false)).toBe(true);
    expect(estCycleADemarrer(cycle({ demarreManuellement: false }), false)).toBe(true);
  });
  it("tout le reste le sort de l'état replié", () => {
    expect(estCycleADemarrer(cycle({ demarreManuellement: true }), false)).toBe(false);
    expect(estCycleADemarrer(cycle({ etapes: { offres_demandees: "2026-02-01" } }), false)).toBe(false);
    expect(estCycleADemarrer(cycle(), true)).toBe(false);
    expect(estCycleADemarrer(cycle({ statut: "clos" }), false)).toBe(false);
  });
});

describe("progression", () => {
  it("compte hors post-terminales et désigne la dernière étape datée dans l'ordre métier", () => {
    expect(progression("assurance", {})).toEqual({ franchies: 0, total: 6, etapeCourante: null });
    const p = progression("assurance", { sinistralite_demandee: "2026-01-10", offres_demandees: "2026-02-20" });
    expect(p.franchies).toBe(2);
    expect(p.total).toBe(6);
    expect(p.etapeCourante?.cle).toBe("offres_demandees");
  });
  it("CTQ : 5 étapes comptées sur 7, la post-terminale datée reste l'étape courante", () => {
    const p = progression("ctq_vmc", { devis_demande: "2026-01-10", ctq_realise: "2026-03-01", transmis_entreprise: "2026-03-15" });
    expect(p.total).toBe(5);
    expect(p.franchies).toBe(2);
    expect(p.etapeCourante?.cle).toBe("transmis_entreprise");
  });
  it("l'ordre de saisie ne compte pas : l'étape 4 datée avant la 2 reste la courante", () => {
    expect(progression("gaz", { devis_presente: "2026-02-01", devis_demande: "2026-03-01" }).etapeCourante?.cle).toBe("devis_presente");
  });
});
