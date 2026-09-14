// SMOKE (manuel, vraie base) : l'alerte « mandat sans AG » sur un portefeuille reel.
//   SMOKE_MANAGER_ID=<uuid> node --env-file=.env.local //     ./node_modules/vitest/vitest.mjs run --config vitest.smoke.config.mts mandats-sans-ag
// SMOKE_MANAGER_ID par defaut : le gestionnaire qui avait 3 alertes le 14/09/2026.

import { describe, expect, it } from "vitest";
import { listerMandatsSansAg } from "./mandats-sans-ag";

describe("mandats sans AG (base reelle)", () => {
  it("remonte des mandats a moins de 3 mois, tries par fin, sans copro deja engagee", async () => {
    process.env.COPRO_SOURCE = "supabase";
    const managerId = process.env.SMOKE_MANAGER_ID ?? "a382fa8d-9e71-47b4-a294-013e4bd33293";
    const lignes = await listerMandatsSansAg(managerId, new Date().toISOString().slice(0, 10));
    for (const l of lignes) {
      console.log(
        `${l.coproCode} ${l.coproNom.padEnd(12)} fin ${l.finMandatISO}  ${l.alerte.niveau} (${l.alerte.joursAvantFin} j)` +
          (l.derniereAgConnueISO ? `  derniere AG connue ${l.derniereAgConnueISO}` : ""),
      );
    }
    const fins = lignes.map((l) => l.finMandatISO);
    expect(fins).toEqual([...fins].sort());
    for (const l of lignes) expect(l.alerte.joursAvantFin).toBeLessThanOrEqual(92);
  });
});
