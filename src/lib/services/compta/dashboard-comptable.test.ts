import { describe, it, expect } from "vitest";
import { getDashboardComptable } from "./dashboard-comptable";
import { getConfirmationEvenementRepository } from "@/lib/adapters/router";

// Adapters MOCK par defaut (COPRO_SOURCE non defini). Les copros mockees ayant une AG a
// venir : S104 (2026-05-28), S045 (2026-06-18), S088 (2026-06-25). Ancre "today" en
// janvier pour toutes les inclure. NB : le store mock des confirmations est module-level
// (partage) -> les tests sont ordonnes (etat vierge d'abord, puis seed).
const TODAY = "2026-01-01";

describe("getDashboardComptable (mock)", () => {
  it("sans confirmation : toutes les AG a venir sont 'a confirmer', triees par date", async () => {
    const { dashboard, total, gestionnaires, mois } = await getDashboardComptable(TODAY);
    expect(total).toBe(3);
    expect(dashboard.confirmees).toHaveLength(0);
    expect(dashboard.aConfirmer.map((l) => l.coproCode)).toEqual(["S104", "S045", "S088"]);
    // Equipe resolue (le mock porte Élise Lambert comme gestionnaire).
    expect(gestionnaires).toContain("Élise Lambert");
    expect(mois).toEqual(["2026-05", "2026-06"]);
  });

  it("filtre par mois d'AG", async () => {
    const { dashboard, total } = await getDashboardComptable(TODAY, { mois: "2026-06" });
    expect(total).toBe(2);
    expect(dashboard.aConfirmer.map((l) => l.coproCode)).toEqual(["S045", "S088"]);
  });

  it("une date confirmee par le CS bascule l'AG dans 'confirmees'", async () => {
    await getConfirmationEvenementRepository().confirmer("S104", "AG", "2026-05-28", "TS");
    const { dashboard } = await getDashboardComptable(TODAY);
    expect(dashboard.confirmees.map((l) => l.coproCode)).toEqual(["S104"]);
    expect(dashboard.aConfirmer.map((l) => l.coproCode)).toEqual(["S045", "S088"]);
  });
});
