import { describe, it, expect } from "vitest";
import {
  POSTES_COMPTA,
  champIdPoste,
  posteDepuisChampId,
  estSlugPoste,
  estStatutPoste,
  statutPoste,
  progressionChecklist,
  statutGlobalChecklist,
  type ChecksCompta,
} from "./compta";

describe("checklist compta - postes & mapping", () => {
  it("expose 9 postes aux slugs uniques et non vides", () => {
    expect(POSTES_COMPTA).toHaveLength(9);
    const slugs = POSTES_COMPTA.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(9);
    for (const p of POSTES_COMPTA) {
      expect(p.slug.length).toBeGreaterThan(0);
      expect(p.libelle.length).toBeGreaterThan(0);
    }
  });

  it("mapping slug <-> champ_id est reversible et prefixe 'compta.check.'", () => {
    expect(champIdPoste("rappro-bancaire")).toBe("compta.check.rappro-bancaire");
    for (const p of POSTES_COMPTA) {
      expect(posteDepuisChampId(champIdPoste(p.slug))).toBe(p.slug);
    }
  });

  it("posteDepuisChampId ignore les champ_id hors checklist ou de poste inconnu", () => {
    expect(posteDepuisChampId("compta.comptes_verifies")).toBeNull();
    expect(posteDepuisChampId("lieu")).toBeNull();
    expect(posteDepuisChampId("point.irve")).toBeNull();
    // Prefixe correct mais slug inconnu -> rejete (pas un poste connu).
    expect(posteDepuisChampId("compta.check.slug-bidon")).toBeNull();
  });

  it("estSlugPoste ne reconnait que les slugs connus", () => {
    expect(estSlugPoste("rappro-bancaire")).toBe(true);
    expect(estSlugPoste("inexistant")).toBe(false);
  });

  it("estStatutPoste valide les 4 statuts et rejette le reste", () => {
    for (const s of ["a_verifier", "ok", "a_revoir", "non_applicable"]) {
      expect(estStatutPoste(s)).toBe(true);
    }
    expect(estStatutPoste("valide")).toBe(false);
    expect(estStatutPoste(null)).toBe(false);
    expect(estStatutPoste(undefined)).toBe(false);
  });
});

describe("statutPoste - defaut", () => {
  it("renvoie 'a_verifier' pour un poste absent, le statut stocke sinon", () => {
    const checks: ChecksCompta = { "rappro-bancaire": "ok" };
    expect(statutPoste(checks, "rappro-bancaire")).toBe("ok");
    expect(statutPoste(checks, "comptes-fournisseurs")).toBe("a_verifier");
  });
});

describe("progressionChecklist", () => {
  it("checklist vierge : tout a verifier, 0 traite", () => {
    const p = progressionChecklist({});
    expect(p).toEqual({ total: 9, ok: 0, aRevoir: 0, nonApplicable: 0, aVerifier: 9, traites: 0 });
  });

  it("compte ok / a_revoir / non_applicable et deduit a_verifier + traites", () => {
    const checks: ChecksCompta = {
      "rappro-bancaire": "ok",
      "comptes-coproprietaires": "ok",
      "comptes-fournisseurs": "a_revoir",
      "repartition-charges": "non_applicable",
    };
    const p = progressionChecklist(checks);
    expect(p.ok).toBe(2);
    expect(p.aRevoir).toBe(1);
    expect(p.nonApplicable).toBe(1);
    expect(p.aVerifier).toBe(5);
    // traites = ok + non_applicable (plus rien a faire), pas a_revoir.
    expect(p.traites).toBe(3);
  });

  it("ignore un slug inconnu present dans la map (compte sur POSTES_COMPTA)", () => {
    const p = progressionChecklist({ "slug-bidon": "ok" } as ChecksCompta);
    expect(p.ok).toBe(0);
    expect(p.total).toBe(9);
  });
});

describe("statutGlobalChecklist", () => {
  it("vierge quand rien n'est touche", () => {
    expect(statutGlobalChecklist({})).toBe("vierge");
  });

  it("a_revoir des qu'un poste est a revoir (prioritaire)", () => {
    expect(statutGlobalChecklist({ "rappro-bancaire": "a_revoir", "travaux-votes": "ok" })).toBe("a_revoir");
  });

  it("en_cours quand une partie seulement est traitee, sans a_revoir", () => {
    expect(statutGlobalChecklist({ "rappro-bancaire": "ok" })).toBe("en_cours");
  });

  it("complet quand tous les postes sont ok / non_applicable", () => {
    const checks: ChecksCompta = {};
    for (const p of POSTES_COMPTA) checks[p.slug] = "ok";
    expect(statutGlobalChecklist(checks)).toBe("complet");
    // Un poste N/A ne casse pas la completude.
    checks[POSTES_COMPTA[0].slug] = "non_applicable";
    expect(statutGlobalChecklist(checks)).toBe("complet");
  });
});
