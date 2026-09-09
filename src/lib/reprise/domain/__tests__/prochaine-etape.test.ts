import { describe, expect, it } from "vitest";
import { etapesParDefaut } from "../dossier";
import type { Etape } from "../dossier";
import { prochaineEtape } from "../prochaine-etape";

const marie = { id: "u-marie", nom: "Marie" };

function avec(mods: Record<string, Partial<Etape>>): Etape[] {
  return etapesParDefaut().map((e) => (mods[e.code] ? { ...e, ...mods[e.code] } : e));
}

describe("prochaineEtape (tableau de suivi)", () => {
  it("1. la premiere etape bloquee gagne : tonalite bloque, titre « Bloqué : … », motif + assigne", () => {
    const etapes = avec({
      CA1: { statut: "fait" },
      BA2: { statut: "en_cours" },
      CA4: { statut: "bloque", note: "La banque n'a pas confirmé", assigneA: marie, echeance: "2026-09-15" },
      EX3: { statut: "bloque", note: "Autre" },
    });
    const p = prochaineEtape(etapes, "2026-09-09");
    expect(p.tonalite).toBe("bloque");
    expect(p.code).toBe("CA4");
    expect(p.phase).toBe("CADRAGE");
    expect(p.titre).toMatch(/^Bloqué : Compte bancaire/);
    expect(p.description).toContain("La banque n'a pas confirmé");
    expect(p.description).toContain("Marie");
    expect(p.assigne).toEqual(marie);
    expect(p.note).toBe("La banque n'a pas confirmé");
    expect(p.echeance).toBe("2026-09-15");
  });

  it("1bis. bloquee sans motif : description de repli", () => {
    const p = prochaineEtape(avec({ CA4: { statut: "bloque" } }));
    expect(p.description).toMatch(/Motif non renseigné/);
  });

  it("2. sinon la premiere en_cours : tonalite normal, titre « En cours : … »", () => {
    const etapes = avec({ CA1: { statut: "fait" }, DO3: { statut: "en_cours", assigneA: marie }, CA5: { statut: "en_cours" } });
    const p = prochaineEtape(etapes, "2026-09-09");
    expect(p.tonalite).toBe("normal");
    expect(p.code).toBe("CA5"); // premiere dans l'ordre de la checklist
    expect(p.titre).toMatch(/^En cours : /);
    const p2 = prochaineEtape(avec({ DO3: { statut: "en_cours", assigneA: marie } }));
    expect(p2.code).toBe("DO3");
    expect(p2.description).toContain("Marie");
  });

  it("3. sinon la premiere a_faire : « Prochaine étape : … », normal", () => {
    const etapes = avec({ CA1: { statut: "fait" }, CA4: { statut: "ignore" } });
    const p = prochaineEtape(etapes, "2026-09-09");
    expect(p.tonalite).toBe("normal");
    expect(p.code).toBe("CA5");
    expect(p.titre).toMatch(/^Prochaine étape : Âge de l.immeuble/);
  });

  it("3bis. a_faire avec echeance depassee : tonalite attention", () => {
    const etapes = avec({ CA1: { statut: "a_faire", echeance: "2026-09-01" } });
    const p = prochaineEtape(etapes, "2026-09-09T08:00:00.000Z");
    expect(p.tonalite).toBe("attention");
    expect(p.description).toContain("Échéance dépassée (01/09/2026)");
    // Echeance a venir ou egale au jour : normal.
    expect(prochaineEtape(avec({ CA1: { echeance: "2026-09-09" } }), "2026-09-09").tonalite).toBe("normal");
    expect(prochaineEtape(avec({ CA1: { echeance: "2026-09-10" } }), "2026-09-09").tonalite).toBe("normal");
    // Sans date du jour : jamais d'alerte de retard.
    expect(prochaineEtape(avec({ CA1: { echeance: "2020-01-01" } })).tonalite).toBe("normal");
  });

  it("4. aucune etape ouverte : « Reprise terminée », tonalite termine, sans code", () => {
    const etapes = etapesParDefaut().map((e, i) => ({ ...e, statut: i % 3 ? ("fait" as const) : ("ignore" as const) }));
    const p = prochaineEtape(etapes, "2026-09-09");
    expect(p.tonalite).toBe("termine");
    expect(p.titre).toBe("Reprise terminée");
    expect(p.code).toBeUndefined();
    expect(p.phase).toBeUndefined();
  });

  it("le premier match gagne : bloque prime sur en_cours qui prime sur a_faire", () => {
    const etapes = avec({ CA1: { statut: "a_faire" }, CP1: { statut: "en_cours" }, CL3: { statut: "bloque", note: "x" } });
    expect(prochaineEtape(etapes).code).toBe("CL3");
    const sansBloque = avec({ CA1: { statut: "a_faire" }, CP1: { statut: "en_cours" } });
    expect(prochaineEtape(sansBloque).code).toBe("CP1");
  });
});
