// Tests de la preuve de bascule (regle Sekou 2026-08-18) : degradation ARITHMETIQUE du
// blocage avant-repartition. Donnees synthetiques.
import { describe, expect, it } from "vitest";
import {
  confronterBalanceBascule,
  verifierBalancePostRepartition,
  detecterAvantRepartition,
  type VerdictPreuveBascule,
} from "../controle-comptes";
import { appliquerAvantRepartition, construirePlan, type EntreeMapping } from "../mapping-compta";
import type { SoldeCompte } from "../compta";

function solde(nomenclature: string, debit: number, credit: number): SoldeCompte {
  return {
    nomenclature,
    classe: Number(nomenclature[0]) as SoldeCompte["classe"],
    debit,
    credit,
    solde: debit - credit,
  };
}

const LIGNES = [
  { compte: "450001", sens: "debit" as const, montant: 300 },
  { compte: "450001", sens: "credit" as const, montant: 100 },
  { compte: "512", sens: "debit" as const, montant: 50 },
];
const CONTROLES = [
  { compte: "450001", reportDebit: 25 }, // solde extrait 450001 = 25 + 300 - 100 = 225
  { compte: "512", reportDebit: 10 }, // solde extrait 512 = 60
];

describe("confronterBalanceBascule", () => {
  it("reproduite au centime quand chaque solde balance = reports + mouvements", () => {
    const v = confronterBalanceBascule(LIGNES, CONTROLES, [solde("450001", 225, 0), solde("512", 60, 0)], "06/05/2026");
    expect(v.reproduite).toBe(true);
    expect(v.confrontes).toBe(2);
    expect(v.ecarts).toHaveLength(0);
    expect(v.dateBascule).toBe("06/05/2026");
  });

  it("un centime d'ecart suffit a refuser la preuve, ecart LOCALISE", () => {
    const v = confronterBalanceBascule(LIGNES, CONTROLES, [solde("450001", 225.01, 0), solde("512", 60, 0)]);
    expect(v.reproduite).toBe(false);
    expect(v.ecarts).toEqual([{ compte: "450001", attendu: 225.01, obtenu: 225 }]);
  });

  it("compte de la balance ABSENT de l'extraction : solde nul tolere, solde non nul = ecart", () => {
    const ok = confronterBalanceBascule(LIGNES, CONTROLES, [
      solde("450001", 225, 0),
      solde("512", 60, 0),
      solde("401999", 0, 0), // solde nul : peut legitimement ne pas apparaitre au GL
    ]);
    expect(ok.reproduite).toBe(true);

    const ko = confronterBalanceBascule(LIGNES, CONTROLES, [
      solde("450001", 225, 0),
      solde("512", 60, 0),
      solde("401999", 0, 80), // il MANQUE des donnees a l'extraction
    ]);
    expect(ko.reproduite).toBe(false);
    expect(ko.nonConfrontables).toContain("401999");
  });

  it("compte EXTRAIT absent de la balance avec solde non nul = ecart (la balance le nie)", () => {
    const v = confronterBalanceBascule(LIGNES, CONTROLES, [solde("450001", 225, 0)]); // 512 manquant
    expect(v.reproduite).toBe(false);
    expect(v.ecarts.some((e) => e.compte === "512" && e.obtenu === 60)).toBe(true);
  });
});

describe("verifierBalancePostRepartition", () => {
  it("coherent quand classe 6 de la balance == total RGD au centime", () => {
    const soldes = [solde("602001", 200.16, 0), solde("611001", 542.65, 0), solde("450001", 99, 0)];
    expect(verifierBalancePostRepartition(soldes, 742.81)).toMatchObject({ coherent: true, classe6: 742.81 });
    expect(verifierBalancePostRepartition(soldes, 742.82).coherent).toBe(false);
  });
});

describe("appliquerAvantRepartition + preuve (la degradation)", () => {
  const verdictBloquant = detecterAvantRepartition([{ compte: "601", reportDebit: 5000 }]);
  const preuveOk: VerdictPreuveBascule = {
    reproduite: true,
    confrontes: 51,
    ecarts: [],
    nonConfrontables: [],
    dateBascule: "06/05/2026",
    postRepartitionVerifiee: true,
  };
  const planVide = construirePlan([] as EntreeMapping[]);

  it("sans preuve : blocage strict (erreur + pretAImporter false), comportement historique", () => {
    const plan = appliquerAvantRepartition(planVide, verdictBloquant);
    expect(plan.pretAImporter).toBe(false);
    expect(plan.erreurs.some((e) => /AVANT repartition/i.test(e))).toBe(true);
  });

  it("preuve reproduite : AVERTISSEMENT explicite, jamais un silence, et l'appui est nomme", () => {
    const plan = appliquerAvantRepartition(planVide, { ...verdictBloquant, degradeParPreuve: preuveOk });
    // Plus d'erreur avant-repartition, mais un WARNING qui dit sur quoi la degradation s'appuie.
    expect(plan.erreurs.some((e) => /AVANT repartition/i.test(e))).toBe(false);
    const w = plan.warnings.find((x) => /DEGRADE en avertissement/i.test(x));
    expect(w).toBeDefined();
    expect(w).toMatch(/06\/05\/2026/);
    expect(w).toMatch(/51 comptes confrontes, 0 ecart/);
    expect(w).toMatch(/classe 6 recoupee par le total du RGD/i);
    // Le verdict reste attache (rejouable cote client).
    expect(plan.avantRepartition?.degradeParPreuve?.reproduite).toBe(true);
  });

  it("preuve NON reproduite : le blocage est MAINTENU", () => {
    const plan = appliquerAvantRepartition(planVide, {
      ...verdictBloquant,
      degradeParPreuve: { ...preuveOk, reproduite: false, ecarts: [{ compte: "512", attendu: 1, obtenu: 2 }] },
    });
    expect(plan.pretAImporter).toBe(false);
    expect(plan.erreurs.some((e) => /AVANT repartition/i.test(e))).toBe(true);
  });

  it("RGD non fourni : la degradation le DIT (recoupement non effectue)", () => {
    const sansRgd: VerdictPreuveBascule = { ...preuveOk };
    delete sansRgd.postRepartitionVerifiee;
    const plan = appliquerAvantRepartition(planVide, { ...verdictBloquant, degradeParPreuve: sansRgd });
    expect(plan.warnings.find((x) => /DEGRADE/i.test(x))).toMatch(/recoupement RGD non effectue/i);
  });
});
