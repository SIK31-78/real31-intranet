import { describe, expect, it } from "vitest";
import {
  balanceParCompte,
  classerParExercice,
  detecterAvantRepartition,
  messageAvantRepartition,
  messageRaccordement,
  raccorderExercices,
  verifierTotauxParCompte,
} from "../controle-comptes";
import type { ControleCompte, LigneEcriture, SensEcriture } from "../ecriture";
import { classeDe } from "../compta";

/** Fabrique une LigneEcriture (classe derivee du compte). */
function ligne(compte: string, sens: SensEcriture, montant: number): LigneEcriture {
  return { date: "2025-10-01", compte, libelle: "x", sens, montant, classe: classeDe(compte) };
}

describe("verifierTotauxParCompte", () => {
  const lignes: LigneEcriture[] = [
    ligne("401000", "credit", 1200),
    ligne("401000", "debit", 1200),
    ligne("512000", "debit", 800),
    ligne("512000", "credit", 1200),
  ];

  it("aucun ecart quand les sommes retombent sur les totaux imprimes", () => {
    const controles: ControleCompte[] = [
      { compte: "401000", totalDebit: 1200, totalCredit: 1200 },
      { compte: "512000", totalDebit: 800, totalCredit: 1200 },
    ];
    const r = verifierTotauxParCompte(lignes, controles);
    expect(r.nbComptesControles).toBe(2);
    expect(r.nbEnEcart).toBe(0);
    expect(r.enEcart).toHaveLength(0);
  });

  it("localise un compte en ecart (somme != total imprime)", () => {
    const controles: ControleCompte[] = [
      { compte: "401000", totalDebit: 1200, totalCredit: 1200 },
      { compte: "512000", totalDebit: 800, totalCredit: 1500 }, // credit imprime faux
    ];
    const r = verifierTotauxParCompte(lignes, controles);
    expect(r.nbComptesControles).toBe(2);
    expect(r.nbEnEcart).toBe(1);
    expect(r.enEcart[0].compte).toBe("512000");
    expect(r.enEcart[0].ecartCredit).toBe(-300); // calcule 1200 - imprime 1500
    expect(r.enEcart[0].ecartDebit).toBe(0);
  });

  it("un compte sans total imprime n'est pas controle (info, pas erreur)", () => {
    const controles: ControleCompte[] = [{ compte: "401000" }];
    const r = verifierTotauxParCompte(lignes, controles);
    expect(r.nbComptesControles).toBe(0);
    expect(r.nbEnEcart).toBe(0);
  });

  it("controle un seul cote quand un seul total est imprime", () => {
    const controles: ControleCompte[] = [{ compte: "512000", totalDebit: 999 }];
    const r = verifierTotauxParCompte(lignes, controles);
    expect(r.nbComptesControles).toBe(1);
    expect(r.enEcart[0].ecartDebit).toBe(-199); // 800 - 999
    expect(r.enEcart[0].ecartCredit).toBeUndefined();
  });

  it("tolere le bruit d'arrondi sous le seuil", () => {
    const controles: ControleCompte[] = [{ compte: "401000", totalDebit: 1200.002, totalCredit: 1200 }];
    const r = verifierTotauxParCompte(lignes, controles);
    expect(r.nbEnEcart).toBe(0);
  });

  it("reconcilie l'a-nouveau : report + ecritures == total imprime (pas d'ecart)", () => {
    // Le total imprime inclut un report d'ouverture debit de 500 que l'on n'extrait pas en
    // ecriture. Sans reconciliation ce serait un faux positif ; avec, l'ecart est nul.
    const controles: ControleCompte[] = [
      { compte: "512000", totalDebit: 1300, totalCredit: 1200, reportDebit: 500 },
    ];
    const r = verifierTotauxParCompte(lignes, controles);
    expect(r.nbComptesControles).toBe(1);
    expect(r.nbEnEcart).toBe(0); // 500 (report) + 800 (ecritures) == 1300 imprime
  });

  it("localise une VRAIE erreur meme apres reintegration du report", () => {
    // report 500 + ecritures 800 = 1300, or le total imprime est 1350 -> ecart reel de -50.
    const controles: ControleCompte[] = [
      { compte: "512000", totalDebit: 1350, reportDebit: 500 },
    ];
    const r = verifierTotauxParCompte(lignes, controles);
    expect(r.nbEnEcart).toBe(1);
    expect(r.enEcart[0].ecartDebit).toBe(-50);
    expect(r.enEcart[0].reportDebit).toBe(500);
  });
});

describe("balanceParCompte", () => {
  const ecr = (compte: string, sens: SensEcriture, montant: number): LigneEcriture => ({
    date: "2026-01-15",
    compte,
    libelle: "TEST",
    sens,
    montant,
    classe: classeDe(compte),
  });

  it("construit la balance complete triee avec statuts ok / ecart / non_controle", () => {
    const lignes = [ecr("450100", "debit", 100), ecr("401200", "credit", 60), ecr("512000", "debit", 40)];
    const controles: ControleCompte[] = [
      { compte: "450100", totalDebit: 100 }, // reconcilie
      { compte: "401200", totalCredit: 80 }, // ecart de -20
      // 512000 : aucun total imprime -> non controle
    ];
    const b = balanceParCompte(lignes, controles, { "450100": "COPRO TEST" });
    expect(b.map((l) => l.compte)).toEqual(["401200", "450100", "512000"]); // tri par compte
    const l450 = b.find((l) => l.compte === "450100")!;
    expect(l450.statut).toBe("ok");
    expect(l450.intitule).toBe("COPRO TEST");
    expect(l450.solde).toBe(100);
    const l401 = b.find((l) => l.compte === "401200")!;
    expect(l401.statut).toBe("ecart");
    expect(l401.ecartCredit).toBe(-20);
    expect(l401.solde).toBe(-60);
    const l512 = b.find((l) => l.compte === "512000")!;
    expect(l512.statut).toBe("non_controle");
  });

  it("reintegre le report a-nouveau dans le solde et le controle", () => {
    const lignes = [ecr("450100", "debit", 800)];
    const controles: ControleCompte[] = [{ compte: "450100", totalDebit: 1300, reportDebit: 500 }];
    const b = balanceParCompte(lignes, controles);
    expect(b[0].statut).toBe("ok"); // 500 + 800 == 1300
    expect(b[0].solde).toBe(1300);
    expect(b[0].reportDebit).toBe(500);
  });

  it("inclut un compte present uniquement dans les controles (aucune ecriture)", () => {
    const b = balanceParCompte([], [{ compte: "450900", totalDebit: 250, reportDebit: 250 }]);
    expect(b).toHaveLength(1);
    expect(b[0].statut).toBe("ok"); // 250 (report) + 0 == 250
  });
});

describe("detecterAvantRepartition", () => {
  it("classe 6 avec report non nul -> bloquant (indice avant repartition)", () => {
    const controles: ControleCompte[] = [{ compte: "6200000", reportDebit: 1500 }];
    const r = detecterAvantRepartition(controles);
    expect(r.avantRepartition).toBe(true);
    expect(r.comptes).toHaveLength(1);
    expect(r.comptes[0]).toEqual({ compte: "6200000", reportDebit: 1500, reportCredit: 0 });
  });

  it("classe 7 avec report credit non nul -> bloquant", () => {
    const controles: ControleCompte[] = [{ compte: "7000000", reportCredit: 900 }];
    const r = detecterAvantRepartition(controles);
    expect(r.avantRepartition).toBe(true);
    expect(r.comptes[0].reportCredit).toBe(900);
  });

  it("classe 4/5 avec report non nul -> PAS bloquant (report de tiers/tresorerie normal)", () => {
    const controles: ControleCompte[] = [
      { compte: "4500001", reportDebit: 800 }, // coproprietaire : report normal
      { compte: "5120000", reportCredit: 1200 }, // banque : report normal
    ];
    const r = detecterAvantRepartition(controles);
    expect(r.avantRepartition).toBe(false);
    expect(r.comptes).toHaveLength(0);
  });

  it("classe 6 avec report SOUS le seuil d'arrondi -> ignore (bruit)", () => {
    const controles: ControleCompte[] = [{ compte: "6200000", reportDebit: 0.002 }];
    const r = detecterAvantRepartition(controles);
    expect(r.avantRepartition).toBe(false);
  });

  it("grand livre bien post-repartition (classe 6/7 sans report) -> non bloquant", () => {
    const controles: ControleCompte[] = [
      { compte: "6200000", totalDebit: 5000 }, // que des ecritures, aucun report
      { compte: "7000000", totalCredit: 5000 },
      { compte: "4500001", reportDebit: 800 },
    ];
    const r = detecterAvantRepartition(controles);
    expect(r.avantRepartition).toBe(false);
  });

  it("trie les comptes concernes et le message reste PII-free (numeros + montants seulement)", () => {
    const controles: ControleCompte[] = [
      { compte: "7010000", reportCredit: 300 },
      { compte: "6100000", reportDebit: 200 },
    ];
    const r = detecterAvantRepartition(controles);
    expect(r.comptes.map((c) => c.compte)).toEqual(["6100000", "7010000"]); // tri
    const msg = messageAvantRepartition(r);
    expect(msg).toContain("6100000");
    expect(msg).toContain("7010000");
    expect(msg).toMatch(/AVANT repartition/i);
    // PII : la detection ne prend que des ControleCompte (numeros + montants, aucun intitule) ->
    // aucun nom ne peut apparaitre. On verifie que les montants captures y figurent.
    expect(msg).toContain("200");
    expect(msg).toContain("300");
  });
});

describe("raccorderExercices (le controle croise)", () => {
  const ligne = (date: string, compte: string, sens: SensEcriture, montant: number): LigneEcriture => ({
    date,
    compte,
    libelle: "x",
    sens,
    montant,
    classe: classeDe(compte),
  });

  it("raccorde au centime : solde final cloture == report a-nouveau en cours", () => {
    // Cloture : le coproprietaire 450 finit debiteur de 300 (report 200 + ecriture debit 100).
    const cloture = {
      lignes: [ligne("2024-06-01", "4500001", "debit", 100)],
      controles: [{ compte: "4500001", reportDebit: 200 }] as ControleCompte[],
    };
    // En cours : son a-nouveau d'ouverture est 300 debiteur -> raccorde.
    const enCours = {
      lignes: [ligne("2025-01-15", "4500001", "credit", 50)],
      controles: [{ compte: "4500001", reportDebit: 300 }] as ControleCompte[],
    };
    const v = raccorderExercices(cloture, enCours);
    expect(v.raccorde).toBe(true);
    expect(v.ecarts).toHaveLength(0);
    expect(v.comptesSansVisAVis).toHaveLength(0);
    expect(v.nbComptesRaccordes).toBe(1);
  });

  it("detecte un ecart : le report en cours ne colle pas au solde cloture", () => {
    const cloture = {
      lignes: [ligne("2024-06-01", "4500001", "debit", 100)],
      controles: [{ compte: "4500001", reportDebit: 200 }] as ControleCompte[],
    };
    // Report en cours 250 au lieu de 300 -> ecart de +50 (solde cloture 300 - report 250).
    const enCours = {
      lignes: [],
      controles: [{ compte: "4500001", reportDebit: 250 }] as ControleCompte[],
    };
    const v = raccorderExercices(cloture, enCours);
    expect(v.raccorde).toBe(false);
    expect(v.ecarts).toHaveLength(1);
    expect(v.ecarts[0]).toMatchObject({ compte: "4500001", soldeCloture: 300, reportEnCours: 250, ecart: 50 });
    const msg = messageRaccordement(v);
    expect(msg).toContain("4500001");
    expect(msg).toMatch(/ecart/i);
    // PII-free : numeros + montants uniquement.
    expect(msg).toContain("50");
  });

  it("un compte 6/7 soldé a zero cote cloture, absent en cours -> raccorde (ignore le zero)", () => {
    const cloture = {
      lignes: [ligne("2024-06-01", "6200000", "debit", 500), ligne("2024-06-01", "6200000", "credit", 500)],
      controles: [] as ControleCompte[],
    };
    const enCours = { lignes: [], controles: [] as ControleCompte[] };
    const v = raccorderExercices(cloture, enCours);
    expect(v.raccorde).toBe(true);
    expect(v.comptesSansVisAVis).toHaveLength(0);
  });

  it("un solde de tiers non nul sans vis-a-vis en cours -> comptesSansVisAVis (bloquant)", () => {
    const cloture = {
      lignes: [ligne("2024-06-01", "4500009", "debit", 700)],
      controles: [] as ControleCompte[],
    };
    const enCours = { lignes: [], controles: [] as ControleCompte[] };
    const v = raccorderExercices(cloture, enCours);
    expect(v.raccorde).toBe(false);
    expect(v.comptesSansVisAVis).toEqual([{ compte: "4500009", cote: "cloture", montant: 700 }]);
  });

  it("un report en cours surgi sans origine cloture -> comptesSansVisAVis cote en_cours", () => {
    const cloture = { lignes: [], controles: [] as ControleCompte[] };
    const enCours = { lignes: [], controles: [{ compte: "4500123", reportCredit: 420 }] as ControleCompte[] };
    const v = raccorderExercices(cloture, enCours);
    expect(v.raccorde).toBe(false);
    expect(v.comptesSansVisAVis).toEqual([{ compte: "4500123", cote: "en_cours", montant: -420 }]);
  });
});

describe("classerParExercice", () => {
  const ligne = (date: string): LigneEcriture => ({
    date,
    compte: "4500001",
    libelle: "x",
    sens: "debit",
    montant: 1,
    classe: 4,
  });

  it("classe le plus ancien en cloture, le plus recent en en cours (par plage de dates)", () => {
    const recent = { lignes: [ligne("2025-01-10"), ligne("2025-06-30")], id: "recent" };
    const ancien = { lignes: [ligne("2024-01-05"), ligne("2024-12-31")], id: "ancien" };
    const r = classerParExercice(recent, ancien);
    expect(r.cloture.id).toBe("ancien");
    expect(r.enCours.id).toBe("recent");
    expect(r.chevauchement).toBe(false);
    expect(r.datesIndisponibles).toBe(false);
  });

  it("signale un chevauchement quand le cloture deborde sur l'en cours", () => {
    const a = { lignes: [ligne("2024-01-05"), ligne("2025-02-15")], id: "a" }; // deborde sur 2025
    const b = { lignes: [ligne("2025-01-10"), ligne("2025-06-30")], id: "b" };
    const r = classerParExercice(a, b);
    expect(r.cloture.id).toBe("a");
    expect(r.chevauchement).toBe(true);
  });

  it("dates absentes des deux cotes -> ordre d'entree + datesIndisponibles", () => {
    const a = { lignes: [] as LigneEcriture[], id: "a" };
    const b = { lignes: [] as LigneEcriture[], id: "b" };
    const r = classerParExercice(a, b);
    expect(r.cloture.id).toBe("a");
    expect(r.enCours.id).toBe("b");
    expect(r.datesIndisponibles).toBe(true);
  });
});
