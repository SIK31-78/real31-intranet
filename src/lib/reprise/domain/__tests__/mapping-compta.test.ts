// Tests du domaine PUR mapping-compta : classification par prefixe, normalisation/appariement de
// noms (exact, inverse, avec civilite, ambigu), resolution par compte et assemblage du plan avec
// garde-fou bloquant. Tous les noms sont SYNTHETIQUES (inventes) - aucune donnee reelle.
import { describe, expect, it } from "vitest";
import {
  MARGE_AMBIGUITE,
  SCORE_SOUS_ENSEMBLE,
  SEUIL_APPARIEMENT_FORT,
  apparierParNom,
  appliquerRaccordement,
  classifierCompte,
  cible471vers472,
  construirePlan,
  detecterGroupesHomonymes,
  mapperCompte,
  normaliserNom,
  racineCompte,
  resoudreComptes,
  scoreAppariement,
  tokensNom,
  type CandidatCompte,
  type CompteSource,
  type ContexteEstale,
  type EntreeMapping,
} from "../mapping-compta";
import type { VerdictRaccordement } from "../controle-comptes";

// Referentiel eStale synthetique reutilise par les tests de resolution.
const FOURNISSEURS: CandidatCompte[] = [
  { nomenclature: "4010001", intitule: "ACME NETTOYAGE" },
  { nomenclature: "4010002", intitule: "ELEC SERVICES SARL" },
];
const COPROS: CandidatCompte[] = [
  { nomenclature: "4500001", intitule: "MARTIN PAUL" },
  { nomenclature: "4500002", intitule: "NOVAK ELENA" },
  { nomenclature: "4500003", intitule: "MARTIN PAULINE" },
];
const CTX: ContexteEstale = {
  fournisseurs: FOURNISSEURS,
  coproprietaires: COPROS,
  nomenclature471999: "4719990",
  nomenclature471998: undefined,
};

describe("racineCompte / classifierCompte", () => {
  it("extrait la racine chiffree avant le point", () => {
    expect(racineCompte("4501.100489139")).toBe("4501");
    expect(racineCompte("512")).toBe("512");
    expect(racineCompte("6211.000000000")).toBe("6211");
  });

  it("classe par prefixe selon les regles metier", () => {
    expect(classifierCompte("4010.400076388")).toBe("fournisseur");
    expect(classifierCompte("4080000")).toBe("fnp_408");
    expect(classifierCompte("4501.100489139")).toBe("coproprietaire");
    expect(classifierCompte("4710000")).toBe("attente_ancien");
    expect(classifierCompte("4720000")).toBe("attente_472");
    expect(classifierCompte("4890000")).toBe("regularisation_489");
    expect(classifierCompte("5120.000000000")).toBe("banque");
    expect(classifierCompte("5010000")).toBe("livret");
    // Tresorerie NON identifiee (Livret A Matera sous 502003, compte courant annexe 502002,
    // caisse 53x) : DECISION HUMAINE, jamais de derivation automatique (decision Sekou
    // 2026-08-18 - une regle sur libelle rouvrirait le pattern-matching, et un mapping tel
    // quel confondrait le fonds ALUR place chez l'ancien syndic avec la tresorerie courante).
    expect(classifierCompte("502003")).toBe("tresorerie_autre");
    expect(classifierCompte("5300000")).toBe("tresorerie_autre");
    expect(classifierCompte("4600000")).toBe("autre_bloc_a"); // autre classe 4
    expect(classifierCompte("6211.000000000")).toBe("charge_bloc_b");
    expect(classifierCompte("1200000")).toBe("hors_bloc_a"); // classe 1
    expect(classifierCompte("7010000")).toBe("hors_bloc_a"); // classe 7
  });

  it("471 -> 472 conserve le suffixe chiffre", () => {
    expect(cible471vers472("4710000")).toBe("4720000");
    expect(cible471vers472("471.123")).toBe("472");
  });
});

describe("normalisation et scoring de noms", () => {
  it("normalise casse, accents, ponctuation et civilites", () => {
    expect(normaliserNom("M. DÜPONT-Jean")).toBe("m dupont jean");
    expect(tokensNom("M. DÜPONT-Jean")).toEqual(["dupont", "jean"]);
    expect(tokensNom("MME Novak Elena")).toEqual(["novak", "elena"]);
  });

  it("score 1 pour egalite d'ensemble, y compris inversion nom/prenom", () => {
    expect(scoreAppariement("MARTIN PAUL", "PAUL MARTIN")).toBe(1);
    expect(scoreAppariement("M MARTIN PAUL", "MARTIN PAUL")).toBe(1); // civilite ignoree
  });

  it("score partiel pour sous-ensemble (nom seul) et 0 pour tokens differents", () => {
    expect(scoreAppariement("MARTIN", "MARTIN PAUL")).toBeCloseTo(0.5, 5);
    expect(scoreAppariement("MARTIN PAUL", "DURAND SOPHIE")).toBe(0);
  });

  // Regles Sekou 2026-08-18, calibrees sur les intitules REELS de S0303 (noms synthetiques
  // ici, motifs identiques) : prefixe de role Matera + entites-couples eStale.
  describe("prefixe de role et sous-ensemble strict (motifs Matera <-> eStale)", () => {
    it("'Coproprietaire' est un token NON distinctif, comme les civilites", () => {
      expect(tokensNom("Copropriétaire - Jean-Michel FABRELLI")).toEqual([
        "jean", "michel", "fabrelli",
      ]);
      // Present sur TOUS les comptes 450 Matera, il diluait tous les scores : 3 tokens
      // communs sur 4 -> 0.75, sous le seuil fort. Retire -> egalite pleine.
      expect(scoreAppariement("Copropriétaire - Jean-Michel FABRELLI", "Fabrelli Jean-Michel")).toBe(1);
    });

    it("sous-ensemble STRICT (>= 2 tokens couverts) = signature forte, pas un appariement faible", () => {
      // Matera nomme UNE personne du foyer, eStale porte l'entite complete.
      expect(
        scoreAppariement("Copropriétaire - Alexandra VERDONI", "Verdoni Tabet Arthur & Alexandra"),
      ).toBeGreaterThanOrEqual(SEUIL_APPARIEMENT_FORT);
      // Idem avec l'ordre inverse et un couple a deux noms.
      expect(
        scoreAppariement("Copropriétaire - Morel - Sabatier", "Sabatier Morel Paul & Morgane"),
      ).toBeGreaterThanOrEqual(SEUIL_APPARIEMENT_FORT);
      // Mais SOUS l'egalite parfaite : quand une egalite exacte coexiste, elle garde la tete,
      // et l'ecart reste sous la marge d'ambiguite -> revue humaine, jamais un choix silencieux.
      expect(SCORE_SOUS_ENSEMBLE).toBeLessThan(1);
      expect(1 - SCORE_SOUS_ENSEMBLE).toBeLessThan(MARGE_AMBIGUITE);
    });

    it("GARDE : un seul token commun ne fait PAS un sous-ensemble fort (deux MARTIN distincts)", () => {
      expect(scoreAppariement("MARTIN", "MARTIN PAUL")).toBeLessThan(SEUIL_APPARIEMENT_FORT);
      expect(scoreAppariement("EDF", "EDF SA")).toBe(1); // "sa" ignore -> egalite, pas sous-ensemble
    });
  });
});

describe("apparierParNom", () => {
  it("retient le meilleur candidat exact sans ambiguite", () => {
    const ap = apparierParNom("PAUL MARTIN", COPROS);
    expect(ap.cible).toBe("4500001");
    expect(ap.confiance).toBe(1);
    expect(ap.ambigu).toBe(false);
  });

  it("flag AMBIGU quand deux candidats sont trop proches", () => {
    // "MARTIN" matche MARTIN PAUL et MARTIN PAULINE a 0.5 chacun -> ambigu.
    const ap = apparierParNom("MARTIN", COPROS);
    expect(ap.confiance).toBeCloseTo(0.5, 5);
    expect(ap.ambigu).toBe(true);
  });

  it("liste vide -> aucun candidat", () => {
    const ap = apparierParNom("PAUL MARTIN", []);
    expect(ap.cible).toBeUndefined();
    expect(ap.confiance).toBe(0);
  });
});

describe("mapperCompte - regles par categorie", () => {
  it("401 apparie fort -> mappe sur la nomenclature eStale", () => {
    const e = mapperCompte("4010.400076388", "ACME NETTOYAGE", CTX);
    expect(e.statut).toBe("mappe");
    expect(e.cible?.nomenclature).toBe("4010001");
    expect(e.cible?.cle).toBe("001");
    expect(e.cible?.journal).toBe("carryforward");
  });

  it("401 sans candidat fiable -> action creer_fournisseur (nom depuis l'intitule)", () => {
    const e = mapperCompte("4010.999", "PLOMBERIE INCONNUE", CTX);
    expect(e.statut).toBe("action_requise");
    expect(e.action).toEqual({ type: "creer_fournisseur", intituleSource: "PLOMBERIE INCONNUE" });
  });

  it("450 apparie fort -> mappe ; ambigu -> warning ; introuvable -> non_mappe (erreur)", () => {
    expect(mapperCompte("4501.1", "ELENA NOVAK", CTX).statut).toBe("mappe");

    const ambigu = mapperCompte("4501.2", "MARTIN", CTX);
    expect(ambigu.statut).toBe("warning_appariement");
    expect(ambigu.confiance).toBeCloseTo(0.5, 5);

    const introuvable = mapperCompte("4501.3", "PERSONNE ABSENTE", CTX);
    expect(introuvable.statut).toBe("non_mappe");
  });

  it("tresorerie non identifiee (502x) -> warning SANS cible : l'humain tranche", () => {
    const e = mapperCompte("502003", "Livret A - BANQUE TEST", CTX);
    expect(e.statut).toBe("warning_appariement");
    expect(e.cible).toBeUndefined();
    expect(e.note).toMatch(/471999.*471998|471998.*471999/);
  });

  it("450 sans intitule -> non_mappe (appariement impossible)", () => {
    expect(mapperCompte("4501.4", undefined, CTX).statut).toBe("non_mappe");
  });

  it("512 banque -> mappe sur 471999 si present, sinon action creer_sous_compte", () => {
    expect(mapperCompte("5120.0", undefined, CTX).cible?.nomenclature).toBe("4719990");
    const sans = mapperCompte("5120.0", undefined, { ...CTX, nomenclature471999: undefined });
    expect(sans.statut).toBe("action_requise");
    expect(sans.action).toEqual({
      type: "creer_sous_compte",
      parent: "471",
      suffix: "999",
      nom: "Banque Ancien Syndic",
    });
  });

  it("501 livret -> action creer_sous_compte 471998 quand absent", () => {
    const e = mapperCompte("5010.0", undefined, CTX);
    expect(e.statut).toBe("action_requise");
    expect(e.action).toMatchObject({ suffix: "998", parent: "471" });
  });

  it("471 -> 472 mappe ; 408 tel quel ; 489 mappe avec note ; classe 6 -> bloc B ; classe 1/7 -> bloc C", () => {
    expect(mapperCompte("4710000", undefined, CTX)).toMatchObject({ statut: "mappe" });
    expect(mapperCompte("4710000", undefined, CTX).cible?.nomenclature).toBe("4720000");
    expect(mapperCompte("4080000", undefined, CTX).statut).toBe("mappe");
    expect(mapperCompte("4890000", undefined, CTX).statut).toBe("mappe");
    expect(mapperCompte("6211.0", undefined, CTX).statut).toBe("reporte_bloc_b");
    expect(mapperCompte("1200000", undefined, CTX).statut).toBe("reporte_bloc_c");
    expect(mapperCompte("7010000", undefined, CTX).statut).toBe("reporte_bloc_c");
  });
});

describe("construirePlan - garde-fou et readiness", () => {
  const resoudre = (comptes: [string, string | undefined][]): EntreeMapping[] =>
    comptes.map(([c, i]) => mapperCompte(c, i, CTX));

  it("plan tout resolu (mappe + actions + reports) -> pretAImporter true", () => {
    const plan = construirePlan(
      resoudre([
        ["4010.1", "ACME NETTOYAGE"], // mappe
        ["4010.9", "NOUVEAU FOURN"], // action_requise
        ["4501.1", "PAUL MARTIN"], // mappe
        ["6211.0", undefined], // reporte_bloc_b
        ["1200000", undefined], // reporte_bloc_c
      ]),
    );
    expect(plan.erreurs).toHaveLength(0);
    expect(plan.warnings).toHaveLength(0);
    expect(plan.pretAImporter).toBe(true);
    expect(plan.compteurs.mappe).toBe(2);
    expect(plan.compteurs.action_requise).toBe(1);
  });

  it("un 450 introuvable (bloc A non mappe) -> ERREUR bloquante, pretAImporter false", () => {
    const plan = construirePlan(resoudre([["4501.3", "PERSONNE ABSENTE"]]));
    expect(plan.erreurs).toHaveLength(1);
    expect(plan.erreurs[0]).toMatch(/4501\.3/);
    expect(plan.erreurs[0]).not.toMatch(/PERSONNE/i); // PII : aucun nom dans le message
    expect(plan.pretAImporter).toBe(false);
  });

  it("un appariement ambigu -> WARNING (jamais silencieux), pretAImporter false", () => {
    const plan = construirePlan(resoudre([["4501.2", "MARTIN"]]));
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toMatch(/confiance 0\.50/);
    expect(plan.pretAImporter).toBe(false);
  });
});

describe("groupes homonymes (coproprietaires a comptes multiples)", () => {
  // 3 comptes source 450 : DURAND JEANNE apparait 2 fois (homonyme), NOVAK 1 fois.
  const COMPTES: CompteSource[] = [
    { compte: "4501.100", intitule: "DURAND JEANNE" },
    { compte: "4501.200", intitule: "Durand  Jeanne" }, // meme nom normalise
    { compte: "4501.300", intitule: "NOVAK ELENA" },
    { compte: "4010.1", intitule: "DURAND JEANNE" }, // fournisseur, PAS un homonyme 450
  ];

  it("detecte les 450 partageant le meme nom normalise (>= 2), ignore les autres classes", () => {
    const groupes = detecterGroupesHomonymes(COMPTES);
    expect(groupes).toHaveLength(1);
    expect(groupes[0].comptes).toEqual(["4501.100", "4501.200"]);
  });

  it("aucun groupe si les noms different ou si un seul compte porte le nom", () => {
    expect(detecterGroupesHomonymes([{ compte: "4501.1", intitule: "NOVAK ELENA" }])).toHaveLength(0);
  });

  it("mapperCompte avec option homonyme DESACTIVE l'appariement automatique (fort -> warning)", () => {
    // Sans l'option : appariement exact -> mappe.
    const auto = mapperCompte("4501.1", "ELENA NOVAK", CTX);
    expect(auto.statut).toBe("mappe");
    // Avec l'option homonyme : meme match parfait est retrograde en warning (revue humaine).
    const homo = mapperCompte("4501.1", "ELENA NOVAK", CTX, { homonyme: true });
    expect(homo.statut).toBe("warning_appariement");
    expect(homo.cible?.nomenclature).toBe("4500002");
  });

  it("resoudreComptes : tout un groupe homonyme passe en revue (aucun mappe auto), plan bloquant", () => {
    // Referentiel avec un owner DURAND JEANNE : sans la regle, les 2 comptes se mapperaient
    // (silencieusement) sur le meme owner -> fusion. La regle l'interdit.
    const ctx: ContexteEstale = {
      fournisseurs: [],
      coproprietaires: [{ nomenclature: "4500009", intitule: "DURAND JEANNE" }],
    };
    const plan = resoudreComptes(
      [
        { compte: "4501.100", intitule: "DURAND JEANNE" },
        { compte: "4501.200", intitule: "DURAND JEANNE" },
      ],
      ctx,
    );
    expect(plan.groupesHomonymes).toHaveLength(1);
    expect(plan.compteurs.mappe).toBe(0); // aucun mappe automatique
    expect(plan.compteurs.warning_appariement).toBe(2); // les 2 en revue
    expect(plan.pretAImporter).toBe(false);
    // Chaque entree du groupe porte l'index de groupe (0).
    for (const e of plan.entrees) expect(e.groupeHomonyme).toBe(0);
  });

  it("resoudreComptes : hors homonyme, l'appariement automatique fonctionne normalement", () => {
    const plan = resoudreComptes(
      [
        { compte: "4501.1", intitule: "ELENA NOVAK" }, // unique -> mappe auto
        { compte: "4010.1", intitule: "ACME NETTOYAGE" }, // fournisseur -> mappe auto
      ],
      CTX,
    );
    expect(plan.groupesHomonymes).toBeUndefined();
    expect(plan.compteurs.mappe).toBe(2);
    expect(plan.pretAImporter).toBe(true);
  });
});

describe("consommation de la LIAISON (onboarding unifie)", () => {
  it("mappe un 450 par la cle compte->owner sans appariement par nom", () => {
    // Contexte eStale SANS coproprietaire apparie : sans liaison, ce compte serait non_mappe.
    const ctx: ContexteEstale = { fournisseurs: [], coproprietaires: [] };
    const e = mapperCompte("4501.100", "PEU IMPORTE LE NOM", ctx, { liaisonNomenclature: "4500042" });
    expect(e.statut).toBe("mappe");
    expect(e.cible?.nomenclature).toBe("4500042");
  });

  it("la liaison court-circuite meme un groupe homonyme (revue faite a l'analyse)", () => {
    const ctx: ContexteEstale = { fournisseurs: [], coproprietaires: [] };
    const plan = resoudreComptes(
      [
        { compte: "4501.100", intitule: "DURAND JEANNE" },
        { compte: "4501.200", intitule: "DURAND JEANNE" }, // homonyme
      ],
      ctx,
      { liaisonParCompte: { "4501.100": "4500011", "4501.200": "4500012" } },
    );
    // Le groupe homonyme est toujours detecte, mais les 2 comptes sont mappes par cle.
    expect(plan.groupesHomonymes).toHaveLength(1);
    expect(plan.compteurs.mappe).toBe(2);
    expect(plan.compteurs.warning_appariement).toBe(0);
    expect(plan.pretAImporter).toBe(true);
  });

  it("sans liaison sur un compte, l'appariement par nom reste le fallback", () => {
    const plan = resoudreComptes(
      [{ compte: "4501.1", intitule: "ELENA NOVAK" }],
      CTX,
      { liaisonParCompte: { "4999.9": "4500099" } }, // liaison sur un autre compte
    );
    expect(plan.compteurs.mappe).toBe(1); // apparie par nom a 4500002 (NOVAK ELENA)
  });
});

describe("appliquerRaccordement", () => {
  const planOk = construirePlan([mapperCompte("4010001", "ACME NETTOYAGE", CTX)]);

  it("raccordement OK -> plan inchange (retro-compatible)", () => {
    const verdict: VerdictRaccordement = { raccorde: true, nbComptesRaccordes: 3, ecarts: [], comptesSansVisAVis: [] };
    const plan = appliquerRaccordement(planOk, verdict);
    expect(plan).toEqual(planOk);
    expect(plan.raccordement).toBeUndefined();
  });

  it("raccordement KO -> erreur prepend, pretAImporter force a false, verdict attache", () => {
    const verdict: VerdictRaccordement = {
      raccorde: false,
      nbComptesRaccordes: 2,
      ecarts: [{ compte: "4500009", soldeCloture: 700, reportEnCours: 650, ecart: 50 }],
      comptesSansVisAVis: [],
    };
    const plan = appliquerRaccordement(planOk, verdict);
    expect(plan.pretAImporter).toBe(false);
    expect(plan.raccordement).toEqual(verdict);
    expect(plan.erreurs[0]).toMatch(/ne se raccordent pas/i);
    expect(plan.erreurs[0]).toContain("4500009");
  });
});
