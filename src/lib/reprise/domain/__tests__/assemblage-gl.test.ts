// Tests de l'assemblage multi-syndics (donnees 100 % synthetiques, scenario calque sur le
// cas reel S0304) : un exercice couvert par un predecesseur (comptes a points, type Foncia)
// puis un successeur (comptes plats, type Matera) qui a repris EN SOLDES. La regle testee :
// quand le detail du predecesseur est fourni, les reports d'ouverture du successeur sont
// OMIS (sinon double comptage), traces, et les totaux imprimes du successeur sont ajustes ;
// le raccord se lit PAR CLASSE (bascule tresorerie -> compte d'attente, rompus).
import { describe, expect, it } from "vitest";
import { assemblerExerciceMultiSyndics } from "../assemblage-gl";
import type { JeuEcritures, LigneEcriture } from "../ecriture";
import { balanceDesEcritures } from "../ecriture";
import { verifierTotauxParCompte } from "../controle-comptes";

const l = (compte: string, date: string, montant: number, sens: "debit" | "credit", libelle = "Ecriture"): LigneEcriture => ({
  date,
  compte,
  libelle,
  sens,
  montant,
  classe: Number(compte[0]) as LigneEcriture["classe"],
});

/** Predecesseur (07/2024 -> 02/2025) : ouverture reelle de l'exercice + son activite. */
function glPredecesseur(): JeuEcritures {
  return {
    lignes: [
      l("4501.100", "2024-07-01", 500, "debit", "Appel provisions"),
      l("7010.000", "2024-07-01", 500, "credit", "Appel provisions"),
      l("5120.000", "2024-08-01", 550, "debit", "Encaissement"),
      l("4501.100", "2024-08-01", 550, "credit", "Reglement"),
      l("6140.000", "2024-10-01", 300, "debit", "Contrat entretien"),
      l("4010.000", "2024-10-01", 300, "credit", "Facture"),
      l("4010.000", "2025-01-15", 300, "debit", "Paiement"),
      l("5120.000", "2025-01-15", 300, "credit", "Paiement"),
    ],
    notes: [],
    // Ouverture de l'exercice (gardee par l'assemblage) : equilibree.
    controles: [
      { compte: "4501.100", reportDebit: 100, totalDebit: 600, totalCredit: 550 },
      { compte: "1031.000", reportCredit: 100 },
    ],
    intitules: { "4501.100": "MARTIN PAUL" },
  };
  // Soldes de fin de mandat par classe : c1 -100, c4 +50, c5 +250, c6 +300, c7 -500.
}

/** Successeur (02/2025 -> 06/2025) : a repris EN SOLDES - ses reports RESUMENT le
 *  predecesseur, la tresorerie predecesseur (classe 5) reprise en compte d'ATTENTE (471). */
function glSuccesseur(): JeuEcritures {
  return {
    lignes: [
      l("450100", "2025-03-01", 200, "debit", "Appel provisions"),
      l("701000", "2025-03-01", 200, "credit", "Appel provisions"),
      l("512000", "2025-04-01", 180, "debit", "Encaissement"),
      l("450100", "2025-04-01", 180, "credit", "Reglement"),
    ],
    notes: [],
    controles: [
      // Les totaux imprimes INCLUENT les reports : ils devront etre ajustes a l'omission.
      { compte: "450100", reportDebit: 50, totalDebit: 250, totalCredit: 180 },
      { compte: "103100", reportCredit: 100 },
      { compte: "471000", reportDebit: 250 }, // la tresorerie du predecesseur, en attente (c4)
      { compte: "602000", reportDebit: 300 },
      { compte: "701000", reportCredit: 500, totalCredit: 700 },
    ],
    intitules: { "450100": "MARTIN PAUL" },
  };
}

describe("assemblerExerciceMultiSyndics", () => {
  const { jeu, rapport } = assemblerExerciceMultiSyndics([
    { label: "GL predecesseur", jeu: glPredecesseur() },
    { label: "GL successeur", jeu: glSuccesseur() },
  ]);

  it("concatene toutes les ecritures et garde les reports de la PREMIERE source seulement", () => {
    expect(jeu.lignes).toHaveLength(12);
    const parCompte = new Map(jeu.controles!.map((c) => [c.compte, c]));
    // Ouverture reelle de l'exercice : gardee.
    expect(parCompte.get("4501.100")).toMatchObject({ reportDebit: 100 });
    expect(parCompte.get("1031.000")).toMatchObject({ reportCredit: 100 });
    // Reports du successeur : OMIS (plus aucun report sur ses controles).
    for (const compte of ["450100", "103100", "471000", "602000", "701000"]) {
      const c = parCompte.get(compte)!;
      expect(c.reportDebit ?? 0).toBe(0);
      expect(c.reportCredit ?? 0).toBe(0);
    }
  });

  it("evite le double comptage : le solde assemble = detail predecesseur + mouvements successeur", () => {
    // Bout a bout naif, la classe 7 porterait -500 (detail) - 500 (report) - 200 = -1200.
    const b = balanceDesEcritures(jeu.lignes);
    expect(b.parClasse[7].solde).toBe(-700);
    // Et l'ensemble reste equilibre (les reports gardes s'annulent, les ecritures aussi).
    expect(b.equilibre).toBe(true);
    const reportsNets = jeu.controles!.reduce((s, c) => s + (c.reportDebit ?? 0) - (c.reportCredit ?? 0), 0);
    expect(Math.round(reportsNets * 100) / 100).toBe(0);
  });

  it("TRACE chaque report omis (jamais silencieux) avec ses totaux", () => {
    expect(rapport.reportsOmis).toHaveLength(5);
    expect(rapport.reportsOmis.every((r) => r.source === "GL successeur")).toBe(true);
    expect(rapport.totalOmisDebit).toBe(600);
    expect(rapport.totalOmisCredit).toBe(600);
    const omis450 = rapport.reportsOmis.find((r) => r.compte === "450100");
    expect(omis450).toMatchObject({ montantSigne: 50 });
    expect(rapport.notes.some((n) => n.includes("OMIS"))).toBe(true);
  });

  it("ajuste les totaux imprimes du successeur : report + ecritures == total reste vrai", () => {
    const parCompte = new Map(jeu.controles!.map((c) => [c.compte, c]));
    expect(parCompte.get("450100")).toMatchObject({ totalDebit: 200, totalCredit: 180 });
    expect(parCompte.get("701000")).toMatchObject({ totalCredit: 200 });
    // Le filet par compte tombe a 0 sur l'assemblage complet.
    const controle = verifierTotauxParCompte(jeu.lignes, jeu.controles!);
    expect(controle.nbEnEcart).toBe(0);
  });

  it("confronte la jonction PAR CLASSE : bascule tresorerie (c5) -> attente (c4) visible", () => {
    expect(rapport.jonctions).toHaveLength(1);
    const j = rapport.jonctions[0]!;
    expect(j).toMatchObject({ de: "GL predecesseur", vers: "GL successeur" });
    const parClasse = new Map(j.parClasse.map((r) => [r.classe, r]));
    expect(parClasse.get(1)).toMatchObject({ soldePredecesseur: -100, reportsSuccesseur: -100, ecart: 0 });
    // La tresorerie du predecesseur (250 en classe 5) reprise en compte d'attente (classe 4).
    expect(parClasse.get(4)).toMatchObject({ soldePredecesseur: 50, reportsSuccesseur: 300, ecart: 250 });
    expect(parClasse.get(5)).toMatchObject({ soldePredecesseur: 250, reportsSuccesseur: 0, ecart: -250 });
    expect(parClasse.get(6)).toMatchObject({ ecart: 0 });
    expect(parClasse.get(7)).toMatchObject({ ecart: 0 });
    // Deux balances completes en face a face : la somme des ecarts retombe a 0.
    expect(j.ecartTotal).toBe(0);
  });

  it("porte les plages de dates de chaque source dans le rapport", () => {
    expect(rapport.sources).toEqual([
      { label: "GL predecesseur", nbEcritures: 8, plageMin: "2024-07-01", plageMax: "2025-01-15" },
      { label: "GL successeur", nbEcritures: 4, plageMin: "2025-03-01", plageMax: "2025-04-01" },
    ]);
  });

  it("rend les ecarts residuels (rompus) tels quels, a tracer - jamais gommes", () => {
    // Le successeur a arrondi son report de classe 1 de 0,07 (rompus mesures sur S0304).
    const succ = glSuccesseur();
    succ.controles = succ.controles!.map((c) =>
      c.compte === "103100" ? { ...c, reportCredit: 100.07 } : c,
    );
    const { rapport: r } = assemblerExerciceMultiSyndics([
      { label: "pred", jeu: glPredecesseur() },
      { label: "succ", jeu: succ },
    ]);
    const c1 = r.jonctions[0]!.parClasse.find((x) => x.classe === 1)!;
    expect(c1.ecart).toBe(-0.07);
    expect(r.jonctions[0]!.ecartTotal).toBe(-0.07);
  });
});

describe("assemblerExerciceMultiSyndics - cas limites", () => {
  it("une seule source : passage a l'identite, rapport trivial", () => {
    const source = glPredecesseur();
    const { jeu, rapport } = assemblerExerciceMultiSyndics([{ label: "seul", jeu: source }]);
    expect(jeu.lignes).toEqual(source.lignes);
    expect(jeu.controles).toEqual(source.controles);
    expect(rapport.reportsOmis).toEqual([]);
    expect(rapport.jonctions).toEqual([]);
  });

  it("zero source : erreur explicite", () => {
    expect(() => assemblerExerciceMultiSyndics([])).toThrowError(/aucune source/);
  });

  it("signale des reports omis DESEQUILIBRES (le successeur a resume la periode en ecritures)", () => {
    // Cas reel S0304 : les reports Matera ne s'equilibrent pas (net -104 706,95) parce que le
    // sortant a aussi resume la periode en ECRITURES ("Depense avant le 25/02"). L'assemblage
    // doit le DIRE, jamais le masquer.
    const succ = glSuccesseur();
    succ.controles = succ.controles!.filter((c) => c.compte !== "602000"); // retire un report debit
    const { rapport } = assemblerExerciceMultiSyndics([
      { label: "pred", jeu: glPredecesseur() },
      { label: "succ", jeu: succ },
    ]);
    expect(rapport.totalOmisDebit).toBe(300);
    expect(rapport.totalOmisCredit).toBe(600);
    expect(rapport.notes.some((n) => n.includes("ne s'equilibrent pas") && n.includes("-300.00"))).toBe(true);
  });

  it("meme numero de compte dans deux sources : totaux retires (jamais un controle faux), note", () => {
    const pred = glPredecesseur();
    const succ = glSuccesseur();
    // Le successeur nomme un compte EXACTEMENT comme le predecesseur.
    succ.controles = [...succ.controles!, { compte: "4501.100", reportDebit: 10, totalDebit: 99 }];
    const { jeu, rapport } = assemblerExerciceMultiSyndics([
      { label: "pred", jeu: pred },
      { label: "succ", jeu: succ },
    ]);
    const c = jeu.controles!.find((x) => x.compte === "4501.100")!;
    expect(c.totalDebit).toBeUndefined();
    expect(c.totalCredit).toBeUndefined();
    expect(c.reportDebit).toBe(100); // le report du plus ancien (l'ouverture reelle) survit
    expect(rapport.notes.some((n) => n.includes("plusieurs sources"))).toBe(true);
  });
});
