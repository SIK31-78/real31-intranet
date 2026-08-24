// Tests du service construirePlanMapping (offline, provider mock). Jeu d'ecritures et referentiel
// eStale 100 % SYNTHETIQUES (noms inventes) - aucune donnee reelle. On verifie la composition de
// bout en bout : resolution de la copro, lecture du referentiel, plan complet + degradation propre.
import { describe, expect, it } from "vitest";
import { construireContexteEstale, construirePlanMapping, preparerRevueMapping } from "../mapping-compta";
import { normaliserGrandLivre } from "@/lib/reprise/adapters/shared/normaliser-compta";
import type { JeuEcritures } from "@/lib/reprise/domain/ecriture";
import type { SoldeCompte } from "@/lib/reprise/domain/compta";
import { classeDe } from "@/lib/reprise/domain/compta";
import type {
  EstaleComptaLectureProvider,
  RefAccounting,
} from "@/lib/reprise/ports/estale-compta-lecture-provider";

// --- Referentiel eStale synthetique de la copro cible -----------------------------
const COMPTES_ESTALE_BRUTS: { nomenclature: string; libelle: string }[] = [
  { nomenclature: "4010001", libelle: "ACME NETTOYAGE" },
  { nomenclature: "4500001", libelle: "MARTIN PAUL" },
  { nomenclature: "4500002", libelle: "NOVAK ELENA" },
  { nomenclature: "4719999", libelle: "Banque Ancien Syndic" },
];
function comptesEstale(): SoldeCompte[] {
  return COMPTES_ESTALE_BRUTS.map((c) => ({
    nomenclature: c.nomenclature,
    libelle: c.libelle,
    classe: classeDe(c.nomenclature),
    debit: 0,
    credit: 0,
    solde: 0,
  }));
}

class MockProvider implements EstaleComptaLectureProvider {
  constructor(private readonly comptes: SoldeCompte[] = comptesEstale()) {}
  async resoudreAccounting(code: string): Promise<RefAccounting | null> {
    return code.toUpperCase() === "S0TEST" ? { condoID: "c", accountingID: "a" } : null;
  }
  async lireBalanceGlobale(): Promise<number> {
    return 0;
  }
  async lireComptes(): Promise<SoldeCompte[]> {
    return this.comptes;
  }
}

// --- Jeu d'ecritures source synthetique (grand livre N-1 fictif) -------------------
function jeuSynthetique(): JeuEcritures {
  const jeu = normaliserGrandLivre({
    lignes: [
      { date: "01/10/2025", compte: "4010.111", libelle: "Facture", sens: "credit", montant: 500 },
      { date: "01/10/2025", compte: "4010.222", libelle: "Facture", sens: "credit", montant: 300 },
      { date: "02/10/2025", compte: "4501.100", libelle: "Appel", sens: "debit", montant: 500 },
      { date: "02/10/2025", compte: "4501.200", libelle: "Appel", sens: "debit", montant: 300 },
      { date: "03/10/2025", compte: "5120.000", libelle: "Banque", sens: "debit", montant: 800 },
      { date: "04/10/2025", compte: "6211.000", libelle: "Charge", sens: "debit", montant: 200 },
    ],
    notes: [],
  });
  // Intitules d'en-tete captures par le pipeline couche texte (PII synthetique).
  jeu.intitules = {
    "4010.111": "ACME NETTOYAGE", // apparie fort -> mappe
    "4010.222": "FOURNISSEUR NOUVEAU", // aucun candidat -> creation
    "4501.100": "PAUL MARTIN", // inverse -> mappe
    "4501.200": "COPRO ABSENT", // introuvable -> erreur bloquante
    // 5120.000 : banque -> 4719999 present ; 6211.000 : bloc B
  };
  return jeu;
}

describe("construireContexteEstale", () => {
  it("separe fournisseurs 401, coproprietaires 450 et detecte le 4719999 (7 caracteres)", () => {
    const ctx = construireContexteEstale(comptesEstale());
    expect(ctx.fournisseurs.map((f) => f.nomenclature)).toEqual(["4010001"]);
    expect(ctx.coproprietaires).toHaveLength(2);
    expect(ctx.nomenclature471999).toBe("4719999");
    expect(ctx.nomenclature471998).toBeUndefined();
  });
});

describe("construirePlanMapping - plan complet (mock)", () => {
  it("resout, lit le referentiel et produit le plan attendu", async () => {
    const r = await construirePlanMapping(jeuSynthetique(), "S0TEST", new MockProvider());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { plan } = r;
    expect(plan.entrees).toHaveLength(6);
    expect(plan.compteurs.mappe).toBe(3); // ACME + banque(471999) + PAUL MARTIN
    expect(plan.compteurs.action_requise).toBe(1); // FOURNISSEUR NOUVEAU
    expect(plan.compteurs.reporte_bloc_b).toBe(1); // 6211
    expect(plan.compteurs.non_mappe).toBe(1); // COPRO ABSENT
    // Le 450 introuvable rend le plan bloquant.
    expect(plan.erreurs).toHaveLength(1);
    expect(plan.pretAImporter).toBe(false);
    // PII : aucun message ne contient de nom.
    for (const m of [...plan.erreurs, ...plan.warnings, ...plan.notes]) {
      expect(m).not.toMatch(/MARTIN|ACME|NOVAK|ABSENT|NOUVEAU/i);
    }
  });

  it("copro introuvable -> { ok:false, message }", async () => {
    const r = await construirePlanMapping(jeuSynthetique(), "S0INCONNUE", new MockProvider());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/introuvable/i);
  });

  it("garde-fou avant-repartition : un compte de classe 6 avec report bloque le plan", async () => {
    const jeu = jeuSynthetique();
    jeu.controles = [{ compte: "6200000", reportDebit: 1500 }]; // signature avant-repartition
    const r = await construirePlanMapping(jeu, "S0TEST", new MockProvider());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.avantRepartition?.avantRepartition).toBe(true);
    expect(r.plan.pretAImporter).toBe(false);
    expect(r.plan.erreurs.some((e) => /AVANT repartition/i.test(e))).toBe(true);
  });

  it("panne du provider -> { ok:false, message } (aucune exception qui remonte)", async () => {
    const enPanne: EstaleComptaLectureProvider = {
      async resoudreAccounting(): Promise<RefAccounting | null> {
        return { condoID: "c", accountingID: "a" };
      },
      async lireComptes(): Promise<SoldeCompte[]> {
        throw new Error("eStale indisponible (HTTP 503)");
      },
      async lireBalanceGlobale(): Promise<number> {
        return 0;
      },
    };
    const r = await construirePlanMapping(jeuSynthetique(), "S0TEST", enPanne);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/impossible/i);
    expect(r.message).toMatch(/503/);
  });
});

describe("preparerRevueMapping - referentiel partis + garde-fou", () => {
  it("expose les comptes 46x/47x (cibles 'coproprietaire parti')", async () => {
    const r = await preparerRevueMapping(jeuSynthetique(), "S0TEST", new MockProvider());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 4719999 (racine 471) est propose comme cible pour un coproprietaire parti.
    expect(r.candidats.partis.map((c) => c.nomenclature)).toContain("4719999");
    // Sans compte de classe 6/7 avec report : aucun blocage avant-repartition.
    expect(r.plan.avantRepartition).toBeUndefined();
  });

  it("bloque le plan si le grand livre est avant repartition (classe 6/7 avec report)", async () => {
    const jeu = jeuSynthetique();
    jeu.controles = [{ compte: "7000000", reportCredit: 900 }];
    const r = await preparerRevueMapping(jeu, "S0TEST", new MockProvider());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.avantRepartition?.avantRepartition).toBe(true);
    expect(r.plan.pretAImporter).toBe(false);
  });
});
