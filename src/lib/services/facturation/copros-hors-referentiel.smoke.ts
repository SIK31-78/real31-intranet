// SMOKE (manuel, vraie base + vrai ESTALE) : les copros ESTALE sans ligne au referentiel.
//   node --env-file=.env.local ./node_modules/vitest/vitest.mjs run --config vitest.smoke.config.mts copros-hors-referentiel

import { describe, expect, it, vi } from "vitest";

// Hors Next, pas de cache de donnees : on appelle la fonction telle quelle.
vi.mock("next/cache", () => ({ unstable_cache: (f: () => unknown) => f }));

describe("copros ESTALE hors referentiel (base reelle)", () => {
  it("fait le controle et liste les copros sans ligne", async () => {
    process.env.COPRO_SOURCE = "supabase";
    const { listerCoprosHorsReferentiel } = await import("./copros-hors-referentiel");
    const etat = await listerCoprosHorsReferentiel();
    console.log(`controle=${etat.controle}`);
    for (const c of etat.copros) console.log(`${c.code}  ${c.nom}`);
    const { getCoproRepository } = await import("@/lib/adapters/router");
    const estale = (await getCoproRepository().listerCoprosEstale()) ?? [];
    console.log(`ESTALE voit ${estale.length} : ` + estale.map((c) => `${c.code} ${c.nom} (${c.adresse.ville})`).join(" | "));
    expect(etat.controle).toBe(true);
  }, 60_000);
});
