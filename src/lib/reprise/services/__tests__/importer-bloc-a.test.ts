// Tests du service d'import du BLOC A (classes 4/5) vers eStale.
//
// Donnees 100 % synthetiques, providers INJECTES (dry-run + mock de lecture) : aucun reseau,
// aucune ecriture eStale reelle, ESTALE_ECRITURE n'est jamais touche. Le routeur n'est jamais
// appele : chaque test passe ses deux providers.
//
// Ce que ces tests garantissent, dans l'ordre du risque :
//   1. tout refus a lieu AVANT la 1re mutation (journal dry-run VIDE) ;
//   2. l'emission capture les ids un par un ;
//   3. la 1re erreur ARRETE tout et rend les ids deja crees, prets pour le rollback.

import { describe, expect, it } from "vitest";
import { DryRunEstaleComptaEcritureProvider } from "@/lib/reprise/adapters/estale-compta/dry-run-ecriture-provider";
import type { SoldeCompte, EtatExercice } from "@/lib/reprise/domain/compta";
import type { JeuEcritures, LigneEcriture } from "@/lib/reprise/domain/ecriture";
import type { EntreeMapping, PlanMapping } from "@/lib/reprise/domain/mapping-compta";
import type { EntreeMappingResolue } from "@/lib/reprise/domain/decisions-mapping";
import type {
  EstaleComptaLectureProvider,
  OwnerEstale,
  RefAccounting,
} from "@/lib/reprise/ports/estale-compta-lecture-provider";
import type {
  EcritureExpertEstale,
  EstaleComptaEcritureProvider,
  FournisseurCreationEstale,
  SousCompteCreationEstale,
} from "@/lib/reprise/ports/estale-compta-ecriture-provider";
import { annulerImport, importerBlocA, JOURNAL_DEFAUT } from "../importer-bloc-a";

// --- Fixtures ---------------------------------------------------------------------

const EXERCICE: EtatExercice = {
  accountingID: "a25",
  debut: "2025-10-01",
  fin: "2026-09-30",
  verrouille: false,
  clos: false,
};

/** Plan comptable eStale de la copro de test : id + dkID, comme la lecture reelle les rend. */
const COMPTES_ESTALE: SoldeCompte[] = [
  {
    id: "acc-401",
    dkID: "dk-001",
    nomenclature: "4010001",
    libelle: "Fournisseur EDF",
    classe: 4,
    debit: 0,
    credit: 0,
    solde: 0,
  },
  {
    id: "acc-450",
    dkID: "dk-001",
    nomenclature: "4500003",
    libelle: "Coproprietaire",
    classe: 4,
    debit: 0,
    credit: 0,
    solde: 0,
  },
  {
    id: "acc-471",
    // Sans dkID : cas reel possible -> l'ecriture part sans cle, et le rapport le signale.
    nomenclature: "471999",
    libelle: "Banque ancien syndic",
    classe: 4,
    debit: 0,
    credit: 0,
    solde: 0,
  },
];

function ligne(p: Partial<LigneEcriture> & Pick<LigneEcriture, "compte" | "classe">): LigneEcriture {
  return {
    date: "2025-11-03",
    libelle: "Ecriture de reprise",
    sens: "debit",
    montant: 100,
    ...p,
  };
}

/** Jeu type : 2 lignes 401, 1 ligne 450, 1 ligne 512 (bloc A) + 1 ligne classe 6 (hors bloc A). */
function jeuType(): JeuEcritures {
  return {
    lignes: [
      ligne({ compte: "4010.100", classe: 4, montant: 120.5 }),
      ligne({ compte: "4010.100", classe: 4, sens: "credit", montant: 120.5, piece: "FA-42" }),
      ligne({ compte: "4501.900", classe: 4, montant: 300 }),
      ligne({ compte: "5120.000", classe: 5, sens: "credit", montant: 300 }),
      ligne({ compte: "6060.000", classe: 6, montant: 999 }),
    ],
    notes: [],
  };
}

function entree(
  compteSource: string,
  nomenclature: string,
  p: Partial<EntreeMappingResolue> = {},
): EntreeMapping {
  return {
    compteSource,
    classe: 4,
    categorie: "autre_bloc_a",
    statut: "mappe",
    cible: { nomenclature, cle: "001", journal: "carryforward" },
    ...p,
  };
}

/** Plan minimal pret a importer couvrant les 4 comptes du bloc A du jeu type. */
function planType(entrees?: EntreeMapping[]): PlanMapping {
  return {
    entrees: entrees ?? [
      entree("4010.100", "4010001"),
      entree("4501.900", "4500003"),
      entree("5120.000", "471999"),
      entree("6060.000", "6060000", { statut: "reporte_bloc_b", classe: 6, categorie: "charge_bloc_b" }),
    ],
    compteurs: {
      mappe: 3,
      action_requise: 0,
      warning_appariement: 0,
      reporte_bloc_b: 1,
      reporte_bloc_c: 0,
      non_mappe: 0,
    },
    erreurs: [],
    warnings: [],
    notes: [],
    pretAImporter: true,
  };
}

/** Provider de LECTURE injecte : copro "S0TEST" connue, plan comptable et exercices parametrables. */
function lecture(
  opts: { comptes?: SoldeCompte[]; exercices?: EtatExercice[]; balance?: number } = {},
): EstaleComptaLectureProvider {
  return {
    async resoudreAccounting(code: string): Promise<RefAccounting | null> {
      return code === "S0TEST" ? { condoID: "condo-1", accountingID: "a25" } : null;
    },
    async lireComptes(): Promise<SoldeCompte[]> {
      return opts.comptes ?? COMPTES_ESTALE;
    },
    async lireBalanceGlobale(): Promise<number> {
      return opts.balance ?? 0;
    },
    async lireOwners(): Promise<OwnerEstale[]> {
      return [];
    },
    async lireExercices(): Promise<EtatExercice[]> {
      return opts.exercices ?? [EXERCICE];
    },
  };
}

/** Ecriture dry-run qui ECHOUE au n-ieme appel (simule un refus eStale en plein import). */
class EcritureQuiEchoue implements EstaleComptaEcritureProvider {
  readonly dry = new DryRunEstaleComptaEcritureProvider();
  private appels = 0;
  constructor(private readonly echoueAu: number) {}

  async creerEcriture(input: EcritureExpertEstale): Promise<{ id: string }> {
    this.appels += 1;
    if (this.appels === this.echoueAu) throw new Error("Oupss");
    return this.dry.creerEcriture(input);
  }
  async supprimerEcriture(id: string): Promise<void> {
    return this.dry.supprimerEcriture(id);
  }
  async creerFournisseur(i: FournisseurCreationEstale) {
    return this.dry.creerFournisseur(i);
  }
  async creerSousCompte(i: SousCompteCreationEstale) {
    return this.dry.creerSousCompte(i);
  }
}

// --- Refus AVANT toute ecriture ---------------------------------------------------

describe("importerBlocA - refus avant la 1re mutation", () => {
  it("refuse un plan qui n'est pas pretAImporter, sans emettre la moindre ecriture", async () => {
    const ecriture = new DryRunEstaleComptaEcritureProvider();
    const plan = { ...planType(), pretAImporter: false, warnings: ["compte 4501.900 : a valider"] };
    const r = await importerBlocA(jeuType(), plan, "S0TEST", { lecture: lecture(), ecriture });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/pas pret a importer/i);
    expect(r.motifs).toContain("compte 4501.900 : a valider");
    expect(ecriture.journal).toHaveLength(0);
  });

  it("refuse un jeu vide et un jeu sans aucune ligne de classe 4/5", async () => {
    const ecriture = new DryRunEstaleComptaEcritureProvider();
    const vide = await importerBlocA({ lignes: [], notes: [] }, planType(), "S0TEST", {
      lecture: lecture(),
      ecriture,
    });
    expect(vide.ok).toBe(false);
    if (!vide.ok) expect(vide.message).toMatch(/aucune ecriture dans le jeu/i);

    const sansBlocA = await importerBlocA(
      { lignes: [ligne({ compte: "6060.000", classe: 6 })], notes: [] },
      planType(),
      "S0TEST",
      { lecture: lecture(), ecriture },
    );
    expect(sansBlocA.ok).toBe(false);
    if (!sansBlocA.ok) expect(sansBlocA.message).toMatch(/classe 4 ou 5/i);
    expect(ecriture.journal).toHaveLength(0);
  });

  it("refuse quand le prerequis d'exercices est KO (verrouille), motifs en clair", async () => {
    const ecriture = new DryRunEstaleComptaEcritureProvider();
    const r = await importerBlocA(jeuType(), planType(), "S0TEST", {
      lecture: lecture({ exercices: [{ ...EXERCICE, verrouille: true }] }),
      ecriture,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/prerequis d'exercices/i);
    expect(r.motifs.join(" ")).toMatch(/VERROUILLE/);
    expect(ecriture.journal).toHaveLength(0);
  });

  it("le prerequis ne porte QUE sur les dates du bloc A (une date hors exercice en classe 6 ne bloque pas)", async () => {
    const ecriture = new DryRunEstaleComptaEcritureProvider();
    const jeu = jeuType();
    jeu.lignes.push(ligne({ compte: "6060.000", classe: 6, date: "2019-01-01" }));

    const r = await importerBlocA(jeu, planType(), "S0TEST", { lecture: lecture(), ecriture });
    expect(r.ok).toBe(true);
  });

  it("refuse un compte du bloc A absent du plan ou de statut non 'mappe' (tous les motifs d'un coup)", async () => {
    const ecriture = new DryRunEstaleComptaEcritureProvider();
    const plan = planType([
      entree("4010.100", "4010001", { statut: "action_requise", cible: undefined }),
      entree("4501.900", "4500003"),
      // "5120.000" volontairement absent du plan.
    ]);
    const r = await importerBlocA(jeuType(), plan, "S0TEST", { lecture: lecture(), ecriture });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motifs).toHaveLength(2);
    expect(r.motifs.join(" ")).toMatch(/action_requise/);
    expect(r.motifs.join(" ")).toMatch(/absent du plan de mapping/);
    expect(ecriture.journal).toHaveLength(0);
  });

  it("refuse quand une cible n'a PAS d'id eStale resolu - avant toute ecriture", async () => {
    const ecriture = new DryRunEstaleComptaEcritureProvider();
    const sansId = COMPTES_ESTALE.map((c) =>
      c.nomenclature === "4500003" ? { ...c, id: undefined } : c,
    );
    const r = await importerBlocA(jeuType(), planType(), "S0TEST", {
      lecture: lecture({ comptes: sansId }),
      ecriture,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/aucune ecriture n'a ete emise/i);
    expect(r.motifs.join(" ")).toMatch(/sans id/);
    expect(ecriture.journal).toHaveLength(0);
  });

  it("refuse quand la nomenclature cible n'existe pas dans le plan comptable eStale", async () => {
    const ecriture = new DryRunEstaleComptaEcritureProvider();
    const r = await importerBlocA(
      jeuType(),
      planType([
        entree("4010.100", "4010001"),
        entree("4501.900", "4509999"),
        entree("5120.000", "471999"),
      ]),
      "S0TEST",
      { lecture: lecture(), ecriture },
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motifs.join(" ")).toMatch(/n'existe pas/);
    expect(ecriture.journal).toHaveLength(0);
  });

  it("refuse une copro inconnue d'eStale et degrade proprement sur une panne de lecture", async () => {
    const ecriture = new DryRunEstaleComptaEcritureProvider();
    const inconnue = await importerBlocA(jeuType(), planType(), "S0INCONNUE", {
      lecture: lecture(),
      ecriture,
    });
    expect(inconnue.ok).toBe(false);
    if (!inconnue.ok) expect(inconnue.message).toMatch(/introuvable dans eStale/i);

    const enPanne = lecture();
    enPanne.lireComptes = async () => {
      throw new Error("HTTP 503");
    };
    const panne = await importerBlocA(jeuType(), planType(), "S0TEST", {
      lecture: enPanne,
      ecriture,
    });
    expect(panne.ok).toBe(false);
    if (!panne.ok) expect(panne.message).toMatch(/503/);
    expect(ecriture.journal).toHaveLength(0);
  });
});

// --- Emission nominale -------------------------------------------------------------

describe("importerBlocA - emission", () => {
  it("emet UNE ecriture par ligne du bloc A, capture les ids, exclut la classe 6", async () => {
    const ecriture = new DryRunEstaleComptaEcritureProvider();
    const r = await importerBlocA(jeuType(), planType(), "S0TEST", { lecture: lecture(), ecriture });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { rapport } = r;
    expect(rapport.succes).toBe(true);
    expect(rapport.compteurs.lignesBlocA).toBe(4);
    expect(rapport.compteurs.emises).toBe(4);
    expect(rapport.compteurs.parClasse).toEqual({ 4: 3, 5: 1 });
    expect(rapport.ids).toEqual([
      "dry-ecriture-1",
      "dry-ecriture-2",
      "dry-ecriture-3",
      "dry-ecriture-4",
    ]);
    expect(rapport.rollback).toEqual([...rapport.ids].reverse());
    expect(rapport.totaux).toEqual({ debit: 420.5, credit: 420.5 });
    expect(rapport.condoID).toBe("condo-1");

    // Le journal dry-run ne contient QUE des creations d'ecritures (4), aucune classe 6.
    expect(ecriture.journal).toHaveLength(4);
    const inputs = ecriture.journal.map((e) => (e.type === "creerEcriture" ? e.input : null));
    expect(inputs.every((i) => i !== null)).toBe(true);
  });

  it("traduit fidelement une ligne en EcritureExpertEstale (sens, montant, journal, dkID, piece)", async () => {
    const ecriture = new DryRunEstaleComptaEcritureProvider();
    await importerBlocA(jeuType(), planType(), "S0TEST", { lecture: lecture(), ecriture });

    const premier = ecriture.journal[0];
    expect(premier.type).toBe("creerEcriture");
    if (premier.type !== "creerEcriture") return;
    expect(premier.input).toMatchObject({
      condoID: "condo-1",
      date: "2025-11-03",
      montant: 120.5,
      mouvement: "debit",
      journal: "carryforward",
      accountID: "acc-401",
      dkID: "dk-001",
    });
    expect(premier.input.piece).toBeUndefined();

    const second = ecriture.journal[1];
    if (second.type !== "creerEcriture") return;
    expect(second.input.mouvement).toBe("credit");
    expect(second.input.piece).toBe("FA-42");

    // Compte cible sans dkID (471999) : l'ecriture part SANS cle, et le rapport le signale.
    const surLeBanque = ecriture.journal
      .map((e) => (e.type === "creerEcriture" ? e.input : null))
      .find((i) => i?.accountID === "acc-471");
    expect(surLeBanque?.dkID).toBeUndefined();
  });

  it("ecarte les lignes des comptes IGNORES a la revue (aucune ecriture pour eux)", async () => {
    const ecriture = new DryRunEstaleComptaEcritureProvider();
    const plan = planType([
      { ...entree("4010.100", "4010001"), ignore: true } as EntreeMapping,
      entree("4501.900", "4500003"),
      entree("5120.000", "471999"),
    ]);
    const r = await importerBlocA(jeuType(), plan, "S0TEST", { lecture: lecture(), ecriture });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rapport.compteurs.lignesIgnorees).toBe(2);
    expect(r.rapport.compteurs.emises).toBe(2);
    expect(r.rapport.notes.join(" ")).toMatch(/ignore/);
    expect(ecriture.journal).toHaveLength(2);
  });

  it("le JOURNAL est celui du plan, avec repli documente, et remonte dans aValider", async () => {
    const ecriture = new DryRunEstaleComptaEcritureProvider();
    const sansJournal = planType([
      // Plan persiste sans journal (cible fabriquee a la main) -> repli JOURNAL_DEFAUT.
      {
        ...entree("4010.100", "4010001"),
        cible: { nomenclature: "4010001", cle: "001" } as EntreeMapping["cible"],
      },
      entree("4501.900", "4500003"),
      entree("5120.000", "471999"),
    ]);
    const r = await importerBlocA(jeuType(), sansJournal, "S0TEST", {
      lecture: lecture(),
      ecriture,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rapport.parJournal).toEqual({ [JOURNAL_DEFAUT]: 2, carryforward: 2 });
    // La question metier est REMONTEE, pas tranchee en douce.
    expect(r.rapport.aValider[0]).toMatch(/JOURNAL/);
    expect(r.rapport.aValider.join(" ")).toMatch(/carryforward/);
    expect(r.rapport.aValider.join(" ")).toMatch(/sans cle de repartition/i);
  });

  it("relireBalance compose verifierBalanceCompta", async () => {
    const ecriture = new DryRunEstaleComptaEcritureProvider();
    const r = await importerBlocA(jeuType(), planType(), "S0TEST", {
      lecture: lecture(),
      ecriture,
      relireBalance: true,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rapport.balanceApres?.ok).toBe(true);

    const sans = await importerBlocA(jeuType(), planType(), "S0TEST", {
      lecture: lecture(),
      ecriture: new DryRunEstaleComptaEcritureProvider(),
    });
    if (!sans.ok) return;
    expect(sans.rapport.balanceApres).toBeUndefined();
  });
});

// --- Arret + rollback ---------------------------------------------------------------

describe("importerBlocA - arret a la 1re erreur", () => {
  it("ARRETE l'import, rend les ids deja crees et pointe la ligne fautive", async () => {
    const ecriture = new EcritureQuiEchoue(3);
    const r = await importerBlocA(jeuType(), planType(), "S0TEST", { lecture: lecture(), ecriture });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { rapport } = r;
    expect(rapport.succes).toBe(false);
    expect(rapport.erreur).toEqual({ seq: 3, compteSource: "4501.900", message: "Oupss" });
    // 2 ecritures creees avant l'echec, et la 4e n'a PAS ete tentee.
    expect(rapport.ids).toEqual(["dry-ecriture-1", "dry-ecriture-2"]);
    expect(rapport.compteurs.aEmettre).toBe(4);
    expect(rapport.compteurs.emises).toBe(2);
    expect(rapport.rollback).toEqual(["dry-ecriture-2", "dry-ecriture-1"]);
    expect(rapport.notes.join(" ")).toMatch(/ARRETE/);
    expect(ecriture.dry.journal.filter((e) => e.type === "creerEcriture")).toHaveLength(2);
  });

  it("annulerImport supprime en ordre INVERSE de la creation", async () => {
    const ecriture = new DryRunEstaleComptaEcritureProvider();
    const r = await importerBlocA(jeuType(), planType(), "S0TEST", { lecture: lecture(), ecriture });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const annulation = await annulerImport(r.rapport.ids, ecriture);
    expect(annulation.complet).toBe(true);
    expect(annulation.supprimes).toEqual([...r.rapport.ids].reverse());
    expect(annulation.echecs).toHaveLength(0);

    const suppressions = ecriture.journal
      .filter((e) => e.type === "supprimerEcriture")
      .map((e) => (e.type === "supprimerEcriture" ? e.id : ""));
    expect(suppressions).toEqual(["dry-ecriture-4", "dry-ecriture-3", "dry-ecriture-2", "dry-ecriture-1"]);
  });

  it("annulerImport est BEST-EFFORT : un echec n'interrompt pas les suivants", async () => {
    const dur: EstaleComptaEcritureProvider = {
      ...new DryRunEstaleComptaEcritureProvider(),
      async creerEcriture() {
        return { id: "x" };
      },
      async supprimerEcriture(id: string) {
        if (id === "e2") throw new Error("entree deja lettree");
      },
      async creerFournisseur() {
        return { id: "f", reference: "F001" };
      },
      async creerSousCompte() {
        return { id: "s", nomenclature: "n" };
      },
    };

    const annulation = await annulerImport(["e1", "e2", "e3"], dur);
    expect(annulation.complet).toBe(false);
    expect(annulation.supprimes).toEqual(["e3", "e1"]);
    expect(annulation.echecs).toEqual([{ id: "e2", message: "entree deja lettree" }]);
  });
});
