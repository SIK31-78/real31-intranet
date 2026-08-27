// Tests de la construction du fichier entries.xlsx (domaine pur) : convention de signe
// (valeurs ABSOLUES, sens dans Type), journal carryforward, cle du compte cible, reports
// a-nouveaux, enrichissement TVA par le RGD, exclusions (489) et routage eclatement.
// Donnees synthetiques.
import { describe, expect, it } from "vitest";
import type { ControleCompte, LigneEcriture } from "../ecriture";
import { resoudreComptes, type ContexteEstale } from "../mapping-compta";
import { construireEntries, dateVersEntries } from "../entries";
import type { LigneRgd } from "../rgd";

const CTX: ContexteEstale = {
  fournisseurs: [{ nomenclature: "4010001", intitule: "ACME NETTOYAGE" }],
  coproprietaires: [{ nomenclature: "4500001", intitule: "MARTIN PAUL", cle: "100" }],
};

const l = (compte: string, date: string, montant: number, sens: "debit" | "credit", libelle = "Ecriture"): LigneEcriture => ({
  date,
  compte,
  libelle,
  sens,
  montant,
  classe: Number(compte[0]) as LigneEcriture["classe"],
});

const LIGNES: LigneEcriture[] = [
  l("4501.100", "2025-02-01", 250, "debit", "Appel T1"),
  l("4010.111", "2025-02-10", 250, "credit", "Facture menage"),
  l("5120.000", "2025-03-01", 100, "debit", "Virement"),
  l("6060000", "2025-03-05", 120, "debit", "Electricite"),
  l("4890000", "2025-12-31", 999, "credit", "Resultat"),
  l("7010000", "2025-01-15", 500, "credit", "Appel provisions"),
];
const CONTROLES: ControleCompte[] = [{ compte: "4501.100", reportDebit: 80 }];

function planPret() {
  return resoudreComptes(
    [
      { compte: "4501.100", intitule: "MARTIN PAUL" },
      { compte: "4010.111", intitule: "ACME NETTOYAGE" },
      { compte: "5120.000" },
      { compte: "6060000" },
      { compte: "4890000" },
      { compte: "7010000" },
    ],
    CTX,
  );
}

describe("construireEntries", () => {
  it("produit les lignes avec valeurs ABSOLUES, journal carryforward et la cle du compte cible", () => {
    const r = construireEntries(LIGNES, CONTROLES, planPret(), { dateOuverture: "2025-01-01" });
    expect(r.erreurs).toEqual([]);
    expect(r.ok).toBe(true);

    // Report a-nouveau du 4501.100 pose a la date d'ouverture, cible avec SA cle (100).
    const report = r.lignes.find((x) => /Report a nouveau/.test(x.libelle))!;
    expect(report).toMatchObject({
      date: "01/01/2025",
      compte: "4500001",
      cle: "100",
      type: "debit",
      montantTTC: 80,
      journal: "carryforward",
    });
    expect(report.commentaire).toContain("4501.100");

    // L'appel du coproprietaire part sur SA cible avec SA cle.
    const appel = r.lignes.find((x) => x.libelle === "Appel T1")!;
    expect(appel).toMatchObject({ compte: "4500001", cle: "100", type: "debit", montantTTC: 250 });

    // La banque va au compte d'attente 4719999, compte source TRACE en commentaire.
    const banque = r.lignes.find((x) => x.libelle === "Virement")!;
    expect(banque.compte).toBe("4719999");
    expect(banque.commentaire).toContain("5120.000");

    // 489 exclu (trace) ; 701 route vers l'eclatement ; ni l'un ni l'autre dans le fichier.
    expect(r.lignes.some((x) => x.libelle === "Resultat")).toBe(false);
    expect(r.lignes.some((x) => x.libelle === "Appel provisions")).toBe(false);
    expect(r.exclusions.map((e) => e.compte)).toEqual(["4890000"]);
    expect(r.versEclatement).toEqual(["7010000"]);
  });

  it("REFUSE un plan non pret (warnings restants) : aucune ligne produite", () => {
    // Un intitule ambigu (sous-ensemble du nom eStale) declenche un warning -> plan non pret.
    const plan = resoudreComptes([{ compte: "4501.200", intitule: "MARTIN" }], CTX);
    expect(plan.pretAImporter).toBe(false);
    const r = construireEntries([l("4501.200", "2025-02-01", 10, "debit")], [], plan);
    expect(r.ok).toBe(false);
    expect(r.lignes).toEqual([]);
    expect(r.erreurs[0]).toMatch(/non pret/);
  });

  it("REFUSE un report non nul sans dateOuverture (message actionnable)", () => {
    const r = construireEntries(LIGNES, CONTROLES, planPret(), {});
    expect(r.ok).toBe(false);
    expect(r.erreurs.some((e) => /dateOuverture absente/.test(e))).toBe(true);
  });

  it("classe 6 : TVA / deductible / recuperable en VALEUR ABSOLUE depuis la ligne RGD appariee", () => {
    const rgd: LigneRgd[] = [
      { date: "2025-03-05", compte: "6060000", ttc: 120, tva: 20, deductible: -20, recuperable: 5 },
    ];
    const r = construireEntries(LIGNES, CONTROLES, planPret(), { dateOuverture: "2025-01-01", rgd });
    const elec = r.lignes.find((x) => x.libelle === "Electricite")!;
    expect(elec.tva).toBe(20);
    expect(elec.deductible).toBe(20); // valeur absolue, jamais un signe
    expect(elec.recuperable).toBe(5);
    expect(r.sansRgd).toBe(0);
  });

  it("classe 6 sans ligne RGD appariee -> compteur sansRgd + warning (travaux legitimes)", () => {
    const rgd: LigneRgd[] = [{ date: "2025-03-05", compte: "6060000", ttc: 999 }]; // montant different
    const r = construireEntries(LIGNES, CONTROLES, planPret(), { dateOuverture: "2025-01-01", rgd });
    expect(r.sansRgd).toBe(1);
    expect(r.warnings.some((w) => /sans ligne RGD/.test(w))).toBe(true);
  });

  it("une ecriture sur un compte ABSENT du plan est une erreur (jamais un silence)", () => {
    const r = construireEntries([l("4620000", "2025-02-01", 10, "debit")], [], planPret(), {
      dateOuverture: "2025-01-01",
    });
    expect(r.ok).toBe(false);
    expect(r.erreurs.some((e) => e.includes("4620000"))).toBe(true);
  });

  it("dateVersEntries convertit ISO -> JJ/MM/AAAA et refuse le reste", () => {
    expect(dateVersEntries("2025-03-05")).toBe("05/03/2025");
    expect(dateVersEntries("05/03/2025")).toBe("");
  });
});
