// Test du service "Mes dossiers en cours" : exclusion des dossiers CLOS, tri par date
// d'ouverture (recent d'abord), et calcul du segment de chaque dossier. Le routeur est
// mocke (getDossiers -> getCoproRepository.list + getDossierRepository.listPourCopros).

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    async list() {
      return [
        { code: "A", nom: "Alpha" },
        { code: "B", nom: "Beta" },
      ];
    },
  }),
  getDossierRepository: () => ({
    async listPourCopros() {
      return [
        { id: "clos1", coproCode: "A", type: "autre", portee: "copropriete", titre: "Archive", statut: "clos", ouvertLe: "2026-07-20", etapes: [], journal: [] },
        { id: "traiter1", coproCode: "A", type: "impaye", portee: "copropriete", titre: "Impaye", statut: "ouvert", ouvertLe: "2026-07-01", etapes: [], journal: [] },
        { id: "clore1", coproCode: "B", type: "travaux", portee: "copropriete", titre: "Travaux", statut: "en_cours", ouvertLe: "2026-07-10", etapes: [{ id: "e1", label: "x", fait: true }, { id: "e2", label: "y", fait: true }], journal: [] },
        { id: "cours1", coproCode: "B", type: "sinistre", portee: "copropriete", titre: "Sinistre", statut: "en_cours", ouvertLe: "2026-07-05", etapes: [{ id: "e1", label: "x", fait: true }, { id: "e2", label: "y", fait: false }], journal: [] },
      ];
    },
  }),
}));

import { getAffairesEnCours } from "@/lib/services/affaires/get-affaires-en-cours";

describe("getAffairesEnCours", () => {
  it("exclut les dossiers clos, trie par ouvertLe desc, calcule le segment", async () => {
    const r = await getAffairesEnCours("g1");

    // Clos exclu.
    expect(r.map((a) => a.dossier.id)).not.toContain("clos1");

    // Tri recent d'abord : clore1 (07-10) > cours1 (07-05) > traiter1 (07-01).
    expect(r.map((a) => a.dossier.id)).toEqual(["clore1", "cours1", "traiter1"]);

    // Segments derives.
    const seg = Object.fromEntries(r.map((a) => [a.dossier.id, a.segment]));
    expect(seg).toEqual({ clore1: "a_clore", cours1: "en_cours", traiter1: "a_traiter" });

    // Nom de copro rapatrie par getDossiers.
    expect(r.find((a) => a.dossier.id === "clore1")?.dossier.coproNom).toBe("Beta");
  });
});
