// Tests du prerequis d'etat avant import eStale (domaine + service, provider mock).
// Donnees 100 % synthetiques. Les regles viennent de la sonde SE999 du 2026-08-18 :
// hors exercice = refus, exercice verrouille = refus, et l'erreur eStale est opaque
// -> tout se verifie AVANT la premiere mutation.
import { describe, expect, it } from "vitest";
import { verifierExercicesPourDates, type EtatExercice } from "@/lib/reprise/domain/compta";
import { verifierPrerequisImport } from "../prerequis-import";
import { normaliserGrandLivre } from "@/lib/reprise/adapters/shared/normaliser-compta";
import type {
  EstaleComptaLectureProvider,
  OwnerEstale,
  RefAccounting,
} from "@/lib/reprise/ports/estale-compta-lecture-provider";
import type { SoldeCompte } from "@/lib/reprise/domain/compta";

const EX_2025: EtatExercice = {
  accountingID: "a25",
  debut: "2025-10-01",
  fin: "2026-09-30",
  verrouille: false,
  clos: false,
};
const EX_2026: EtatExercice = {
  accountingID: "a26",
  debut: "2026-10-01",
  fin: "2027-09-30",
  verrouille: false,
  clos: false,
};

describe("verifierExercicesPourDates (domaine pur)", () => {
  it("ok quand chaque date tombe dans un exercice ouvert et deverrouille", () => {
    const v = verifierExercicesPourDates([EX_2025, EX_2026], ["2025-10-15", "2026-11-02"]);
    expect(v.ok).toBe(true);
    expect(v.motifs).toHaveLength(0);
  });

  it("bloque une date HORS de tout exercice, avec les bornes dans le motif", () => {
    const v = verifierExercicesPourDates([EX_2026], ["2025-06-15", "2026-11-02"]);
    expect(v.ok).toBe(false);
    expect(v.motifs[0]).toMatch(/hors de tout exercice/i);
    expect(v.motifs[0]).toMatch(/2025-06-15/);
    expect(v.motifs[0]).toMatch(/prerequis de creation/i);
  });

  it("bloque un exercice VERROUILLE (lockedAt) - la lecon SE999", () => {
    const v = verifierExercicesPourDates(
      [{ ...EX_2025, verrouille: true }],
      ["2025-12-01"],
    );
    expect(v.ok).toBe(false);
    expect(v.motifs[0]).toMatch(/VERROUILLE/);
    expect(v.motifs[0]).toMatch(/deverrouiller/i);
  });

  it("bloque un exercice CLOS, et distingue le motif du verrou", () => {
    const v = verifierExercicesPourDates([{ ...EX_2025, clos: true }], ["2025-12-01"]);
    expect(v.ok).toBe(false);
    expect(v.motifs[0]).toMatch(/CLOS/);
    expect(v.motifs[0]).toMatch(/rouvrir/i);
  });

  it("borne pile : le premier et le dernier jour de l'exercice sont DANS l'exercice", () => {
    const v = verifierExercicesPourDates([EX_2025], ["2025-10-01", "2026-09-30"]);
    expect(v.ok).toBe(true);
  });

  it("ignore les dates vides (deja signalees par le normaliseur) et aucun exercice = motif", () => {
    expect(verifierExercicesPourDates([EX_2025], [""]).ok).toBe(true);
    const v = verifierExercicesPourDates([], ["2025-12-01"]);
    expect(v.ok).toBe(false);
    expect(v.motifs[0]).toMatch(/aucun exercice/i);
  });
});

describe("verifierPrerequisImport (service, mock)", () => {
  function jeu(dates: string[]) {
    return normaliserGrandLivre({
      lignes: dates.map((date, i) => ({
        date: `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`,
        compte: "4010.1",
        libelle: `Ligne ${i}`,
        sens: "debit" as const,
        montant: 10,
      })),
      notes: [],
    });
  }

  function provider(exercices: EtatExercice[]): EstaleComptaLectureProvider {
    return {
      async resoudreAccounting(code: string): Promise<RefAccounting | null> {
        return code === "S0TEST" ? { condoID: "c1", accountingID: "a25" } : null;
      },
      async lireComptes(): Promise<SoldeCompte[]> {
        return [];
      },
      async lireBalanceGlobale(): Promise<number> {
        return 0;
      },
      async lireOwners(): Promise<OwnerEstale[]> {
        return [];
      },
      async lireExercices() {
        return exercices;
      },
    };
  }

  it("verdict ok sur un jeu couvert par les exercices", async () => {
    const r = await verifierPrerequisImport(jeu(["2025-11-03", "2026-01-15"]), "S0TEST", provider([EX_2025]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.verdict.ok).toBe(true);
    expect(r.condoID).toBe("c1");
  });

  it("verdict bloquant quand une date n'a pas d'exercice", async () => {
    const r = await verifierPrerequisImport(jeu(["2024-06-15"]), "S0TEST", provider([EX_2025]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.verdict.ok).toBe(false);
  });

  it("copro introuvable / panne -> { ok:false, message }, jamais d'exception", async () => {
    const r = await verifierPrerequisImport(jeu(["2025-11-03"]), "S0INCONNUE", provider([EX_2025]));
    expect(r.ok).toBe(false);
    const enPanne = provider([EX_2025]);
    enPanne.lireExercices = async () => {
      throw new Error("HTTP 503");
    };
    const r2 = await verifierPrerequisImport(jeu(["2025-11-03"]), "S0TEST", enPanne);
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.message).toMatch(/503/);
  });
});
