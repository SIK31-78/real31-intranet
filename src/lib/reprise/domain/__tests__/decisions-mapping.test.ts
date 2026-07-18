// Tests du domaine PUR decisions-mapping : application des gestes humains sur un plan de mapping
// et recalcul du verdict pretAImporter. Tous les noms sont SYNTHETIQUES (inventes) - aucune
// donnee reelle, aucun nom dans les messages du plan (regle PII).
import { describe, expect, it } from "vitest";
import {
  appliquerAvantRepartition,
  construirePlan,
  mapperCompte,
  type ContexteEstale,
} from "../mapping-compta";
import type { VerdictAvantRepartition } from "../controle-comptes";
import { appliquerDecisions, type DecisionEntree } from "../decisions-mapping";

const CTX: ContexteEstale = {
  fournisseurs: [
    { nomenclature: "4010001", intitule: "ACME NETTOYAGE" },
    { nomenclature: "4010002", intitule: "ELEC SERVICES" },
  ],
  coproprietaires: [
    { nomenclature: "4500001", intitule: "MARTIN PAUL" },
    { nomenclature: "4500002", intitule: "MARTIN PAULINE" },
    { nomenclature: "4500003", intitule: "NOVAK ELENA" },
  ],
  nomenclature471999: "4719990",
  nomenclature471998: undefined,
};

const resoudre = (comptes: [string, string | undefined][]) =>
  construirePlan(comptes.map(([c, i]) => mapperCompte(c, i, CTX)));

describe("appliquerDecisions - types de decision", () => {
  it("valider_candidat : un warning d'appariement devient mappe (plus d'alerte)", () => {
    const plan = resoudre([["4501.2", "MARTIN"]]); // ambigu -> warning
    expect(plan.warnings).toHaveLength(1);

    const decisions: DecisionEntree[] = [{ compteSource: "4501.2", decision: { type: "valider_candidat" } }];
    const r = appliquerDecisions(plan, decisions);

    expect(r.warnings).toHaveLength(0);
    expect(r.compteurs.warning_appariement).toBe(0);
    expect(r.compteurs.mappe).toBe(1);
    expect(r.entrees[0]?.statut).toBe("mappe");
    expect(r.pretAImporter).toBe(true);
    expect(r.decisionsAppliquees).toBe(1);
  });

  it("choisir_cible : un 450 non mappe devient mappe sur la nomenclature choisie", () => {
    const plan = resoudre([["4501.3", "PERSONNE ABSENTE"]]); // introuvable -> non_mappe (erreur)
    expect(plan.erreurs).toHaveLength(1);
    expect(plan.pretAImporter).toBe(false);

    const decisions: DecisionEntree[] = [
      { compteSource: "4501.3", decision: { type: "choisir_cible", nomenclature: "4500003" } },
    ];
    const r = appliquerDecisions(plan, decisions);

    expect(r.erreurs).toHaveLength(0);
    expect(r.entrees[0]?.statut).toBe("mappe");
    expect(r.entrees[0]?.cible?.nomenclature).toBe("4500003");
    expect(r.pretAImporter).toBe(true);
  });

  it("creer_fournisseur : un 401 en warning bascule en action_requise", () => {
    // "ELEC SERVICE" ~ "ELEC SERVICES" via sous-ensemble -> warning faible.
    const plan = resoudre([["4010.9", "ELEC SERVICE"]]);
    expect(plan.compteurs.warning_appariement).toBe(1);

    const decisions: DecisionEntree[] = [{ compteSource: "4010.9", decision: { type: "creer_fournisseur" } }];
    const r = appliquerDecisions(plan, decisions);

    expect(r.warnings).toHaveLength(0);
    expect(r.entrees[0]?.statut).toBe("action_requise");
    expect(r.entrees[0]?.action).toEqual({ type: "creer_fournisseur", intituleSource: "ELEC SERVICE" });
    expect(r.pretAImporter).toBe(true);
  });

  it("creer_compte_separe : un 450 non mappe devient action_requise (rattache a un owner)", () => {
    const plan = resoudre([["4501.3", "PERSONNE ABSENTE"]]); // 450 introuvable -> non_mappe (erreur)
    expect(plan.pretAImporter).toBe(false);

    const decisions: DecisionEntree[] = [
      { compteSource: "4501.3", decision: { type: "creer_compte_separe", owner: "4500001" } },
    ];
    const r = appliquerDecisions(plan, decisions);

    expect(r.erreurs).toHaveLength(0);
    expect(r.entrees[0]?.statut).toBe("action_requise");
    expect(r.entrees[0]?.action).toEqual({ type: "creer_compte_separe", ownerNomenclature: "4500001" });
    expect(r.entrees[0]?.cible).toBeUndefined();
    expect(r.compteurs.action_requise).toBe(1);
    expect(r.pretAImporter).toBe(true);
  });

  it("creer_compte_separe inapplicable sur un non-450 (ex. fournisseur) : entree inchangee + note", () => {
    const plan = resoudre([["4010.9", "FOURNISSEUR NOUVEAU"]]); // 401 sans candidat -> action creer_fournisseur
    const r = appliquerDecisions(plan, [
      { compteSource: "4010.9", decision: { type: "creer_compte_separe", owner: "4500001" } },
    ]);
    expect(r.entrees[0]?.action).toEqual({ type: "creer_fournisseur", intituleSource: "FOURNISSEUR NOUVEAU" });
    expect(r.notes.some((n) => /inapplicable/i.test(n))).toBe(true);
  });

  it("coproprietaire_parti : un 450 non mappe devient mappe sur le compte 47x dedie", () => {
    const plan = resoudre([["4501.3", "PERSONNE ABSENTE"]]); // 450 introuvable -> non_mappe (erreur)
    expect(plan.pretAImporter).toBe(false);

    const decisions: DecisionEntree[] = [
      { compteSource: "4501.3", decision: { type: "coproprietaire_parti", nomenclature: "471005" } },
    ];
    const r = appliquerDecisions(plan, decisions);

    expect(r.erreurs).toHaveLength(0);
    expect(r.entrees[0]?.statut).toBe("mappe");
    expect(r.entrees[0]?.cible?.nomenclature).toBe("471005");
    expect(r.entrees[0]?.action).toBeUndefined();
    expect(r.compteurs.mappe).toBe(1);
    expect(r.pretAImporter).toBe(true);
  });

  it("coproprietaire_parti inapplicable sur un non-450 (fournisseur) : entree inchangee + note", () => {
    const plan = resoudre([["4010.9", "FOURNISSEUR NOUVEAU"]]); // 401 -> action creer_fournisseur
    const r = appliquerDecisions(plan, [
      { compteSource: "4010.9", decision: { type: "coproprietaire_parti", nomenclature: "471005" } },
    ]);
    expect(r.entrees[0]?.action).toEqual({ type: "creer_fournisseur", intituleSource: "FOURNISSEUR NOUVEAU" });
    expect(r.notes.some((n) => /inapplicable/i.test(n))).toBe(true);
    // Le numero cible ne fuit pas dans les messages (pas de PII de toute facon, mais coherence).
    expect(r.entrees[0]?.cible).toBeUndefined();
  });

  it("ignorer : le compte sort des erreurs mais garde son statut brut + flag ignore", () => {
    const plan = resoudre([["4501.3", "PERSONNE ABSENTE"]]); // non_mappe -> erreur
    const decisions: DecisionEntree[] = [
      { compteSource: "4501.3", decision: { type: "ignorer", motif: "compte solde a zero, hors reprise" } },
    ];
    const r = appliquerDecisions(plan, decisions);

    expect(r.erreurs).toHaveLength(0);
    expect(r.entrees[0]?.ignore).toBe(true);
    expect(r.pretAImporter).toBe(true);
    // Le motif (potentiellement PII) ne fuit dans aucun message du plan.
    for (const m of [...r.erreurs, ...r.warnings, ...r.notes]) {
      expect(m).not.toMatch(/solde a zero/i);
    }
  });
});

describe("appliquerDecisions - recalcul global et robustesse", () => {
  it("plusieurs alertes : pretAImporter ne passe true qu'une fois TOUTES tranchees", () => {
    const plan = resoudre([
      ["4501.2", "MARTIN"], // warning (ambigu)
      ["4501.3", "PERSONNE ABSENTE"], // erreur (non_mappe)
      ["4010.1", "ACME NETTOYAGE"], // mappe (deja ok)
    ]);
    expect(plan.pretAImporter).toBe(false);

    // On ne tranche que le warning : il reste l'erreur -> toujours bloquant.
    const partiel = appliquerDecisions(plan, [
      { compteSource: "4501.2", decision: { type: "valider_candidat" } },
    ]);
    expect(partiel.aTraiter).toBe(1);
    expect(partiel.pretAImporter).toBe(false);

    // On tranche aussi l'erreur -> pret.
    const complet = appliquerDecisions(plan, [
      { compteSource: "4501.2", decision: { type: "valider_candidat" } },
      { compteSource: "4501.3", decision: { type: "ignorer", motif: "hors perimetre" } },
    ]);
    expect(complet.aTraiter).toBe(0);
    expect(complet.pretAImporter).toBe(true);
  });

  it("decision sur un compte inconnu : ignoree avec une note, aucun crash", () => {
    const plan = resoudre([["4010.1", "ACME NETTOYAGE"]]);
    const r = appliquerDecisions(plan, [
      { compteSource: "9999.0", decision: { type: "valider_candidat" } },
    ]);
    expect(r.entrees).toHaveLength(1);
    expect(r.decisionsAppliquees).toBe(0);
    expect(r.notes.some((n) => n.includes("9999.0") && /absent du plan/i.test(n))).toBe(true);
  });

  it("decision inapplicable (creer_fournisseur sur un 450) : entree inchangee + note", () => {
    const plan = resoudre([["4501.3", "PERSONNE ABSENTE"]]); // 450 non_mappe
    const r = appliquerDecisions(plan, [
      { compteSource: "4501.3", decision: { type: "creer_fournisseur" } },
    ]);
    expect(r.entrees[0]?.statut).toBe("non_mappe"); // inchange
    expect(r.pretAImporter).toBe(false); // toujours bloquant
    expect(r.notes.some((n) => /inapplicable/i.test(n))).toBe(true);
  });

  it("garde-fou avant-repartition : bloquant STRICT meme quand tout est mappe", () => {
    // Plan sans aucune alerte de mapping (un fournisseur bien apparie).
    const planOk = resoudre([["4010.1", "ACME NETTOYAGE"]]);
    expect(planOk.pretAImporter).toBe(true);

    // On y attache le verdict avant-repartition (comptes de classe 6/7 avec report).
    const verdict: VerdictAvantRepartition = {
      avantRepartition: true,
      comptes: [{ compte: "6200000", reportDebit: 1500, reportCredit: 0 }],
    };
    const planBloque = appliquerAvantRepartition(planOk, verdict);
    expect(planBloque.pretAImporter).toBe(false);
    expect(planBloque.erreurs.some((e) => /AVANT repartition/i.test(e))).toBe(true);

    // Le recalcul cote client (appliquerDecisions) DOIT conserver le blocage, meme sans decision.
    const r = appliquerDecisions(planBloque, []);
    expect(r.pretAImporter).toBe(false);
    expect(r.aTraiter).toBeGreaterThanOrEqual(1);
    expect(r.erreurs.some((e) => /AVANT repartition/i.test(e))).toBe(true);
    // Et aucun geste humain ne le leve (pas d'override) : on ne peut pas trancher ce compte.
    expect(r.avantRepartition?.avantRepartition).toBe(true);
  });

  it("sans decision : le plan resolu est equivalent au plan de depart", () => {
    const plan = resoudre([
      ["4010.1", "ACME NETTOYAGE"],
      ["6211.0", undefined],
    ]);
    const r = appliquerDecisions(plan, []);
    expect(r.compteurs).toEqual(plan.compteurs);
    expect(r.erreurs).toEqual(plan.erreurs);
    expect(r.warnings).toEqual(plan.warnings);
    expect(r.pretAImporter).toBe(plan.pretAImporter);
    expect(r.decisionsAppliquees).toBe(0);
  });
});
