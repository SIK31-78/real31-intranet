// Test du service produireComptaMultiSources : un exercice couvert par DEUX syndics
// (predecesseur + sortant ayant repris en soldes) produit UN entries.xlsx d'exercice
// complet - reports du successeur omis, batterie verte, cibles de calage justes, rapport
// d'assemblage expose. Donnees 100 % synthetiques, aucune ecriture, aucun reseau.
import { describe, expect, it } from "vitest";
import type { JeuEcritures, LigneEcriture } from "@/lib/reprise/domain/ecriture";
import { resoudreComptes, type ContexteEstale } from "@/lib/reprise/domain/mapping-compta";
import { appliquerDecisions } from "@/lib/reprise/domain/decisions-mapping";
import { produireComptaMultiSources } from "../produire-compta";

const CTX: ContexteEstale = {
  fournisseurs: [],
  coproprietaires: [{ nomenclature: "4500001", intitule: "MARTIN PAUL" }],
};

const l = (compte: string, date: string, montant: number, sens: "debit" | "credit", libelle = "Ecriture"): LigneEcriture => ({
  date,
  compte,
  libelle,
  sens,
  montant,
  classe: Number(compte[0]) as LigneEcriture["classe"],
});

/** Predecesseur (type Foncia, comptes a points) : un appel de 250 sur Martin. */
const PRED: JeuEcritures = {
  lignes: [
    l("4501.100", "2024-07-01", 250, "debit", "Appel provisions"),
    l("7010.000", "2024-07-01", 250, "credit", "Appel provisions"),
  ],
  notes: [],
  controles: [],
  intitules: { "4501.100": "MARTIN PAUL" },
};

/** Successeur (type Matera, comptes plats) : reports qui RESUMENT le predecesseur + un
 *  encaissement de 100. Le meme coproprietaire porte un AUTRE numero de compte. */
const SUCC: JeuEcritures = {
  lignes: [
    l("512000", "2025-03-01", 100, "debit", "Encaissement"),
    l("450100", "2025-03-01", 100, "credit", "Reglement"),
  ],
  notes: [],
  controles: [
    { compte: "450100", reportDebit: 250 },
    { compte: "701000", reportCredit: 250 },
  ],
  intitules: { "450100": "MARTIN PAUL" },
};

describe("produireComptaMultiSources", () => {
  it("produit un exercice complet sans double comptage, batterie verte, rapport expose", async () => {
    const brut = resoudreComptes(
      [
        { compte: "4501.100", intitule: "MARTIN PAUL" },
        { compte: "450100", intitule: "MARTIN PAUL" },
        { compte: "512000" },
        { compte: "7010.000" },
        { compte: "701000" },
      ],
      CTX,
    );
    // Deux comptes HOMONYMES (un par syndic) visent le meme coproprietaire : l'appariement
    // automatique se retient (warning), la revue humaine tranche - c'est le flux reel.
    const plan = appliquerDecisions(brut, [
      { compteSource: "4501.100", decision: { type: "valider_candidat" } },
      { compteSource: "450100", decision: { type: "valider_candidat" } },
    ]);
    const r = await produireComptaMultiSources(
      [
        { label: "GL predecesseur", jeu: PRED },
        { label: "GL successeur", jeu: SUCC },
      ],
      plan,
      { dateOuverture: "2024-07-01", nonReconnues: [{ source: "gl-pred.pdf", nb: 0 }, { source: "gl-succ.pdf", nb: 0 }] },
    );

    expect(r.erreurs).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.batterie?.nbEchecs).toBe(0);

    // Les DEUX comptes du meme coproprietaire (un par syndic) convergent sur la cible
    // 4500001 : appel 250 (predecesseur) - reglement 100 (successeur) = 150, SANS le report
    // de 250 du successeur (il resumait l'appel du predecesseur : l'inclure = 400, faux).
    expect(r.cibles["4500001"]).toBe(150);
    expect(r.cibles["4719999"]).toBe(100); // banque agregee
    // Eclatement classe 7 : -250 (predecesseur) - 0 : le report 701000 du successeur omis.
    expect(r.fiche?.totalSigne).toBe(-250);

    // Le rapport d'assemblage est expose et ses notes rejoignent les warnings.
    expect(r.assemblage.reportsOmis).toHaveLength(2);
    expect(r.assemblage.totalOmisDebit).toBe(250);
    expect(r.assemblage.totalOmisCredit).toBe(250);
    expect(r.assemblage.jonctions).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes("OMIS"))).toBe(true);
  });
});
