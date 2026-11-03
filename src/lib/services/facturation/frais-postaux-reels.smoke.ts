// SMOKE manuel (REA-490), LECTURE SEULE : la chaine complete des frais postaux au reel
// sur les vraies factures ESTALE et la vraie base. Repere : les factures de Clementine du
// 23/10/2026 (S306 : 44 LRAR = 350,24 EUR sur le PV de juillet).
//
// Lancement : corepack pnpm run test:smoke frais-postaux-reels

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  const txt = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const l of txt.split("\n")) {
    const s = l.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const i = s.indexOf("=");
    const k = s.slice(0, i);
    if (!process.env[k]) process.env[k] = s.slice(i + 1);
  }
});

describe("frais postaux au réel (ESTALE réel)", () => {
  it("retrouve le PV de S306 sur la facture de juillet 2026", async () => {
    const { apercuFraisPostaux } = await import("./frais-postaux-reels");
    const a = await apercuFraisPostaux("QXDJABFB-0001");
    process.stdout.write(
      JSON.stringify(
        {
          factures: a.factures.map((f) => `${f.dateISO} ${f.reference}`),
          coprosAuReel: a.coprosAuReel,
          parCopro: a.periode.parCopro.map((c) => ({
            copro: c.coproCode,
            timbresEtLre: c.timbresEtLreHtCentimes / 100,
            service: c.serviceHtCentimes / 100,
            envois: c.envois.map((e) => `${e.dateISO} ${e.libelle} (${e.plis} plis, ${e.timbresHtCentimes / 100})`),
          })),
          nonRattaches: a.periode.nonRattaches,
        },
        null,
        1,
      ),
    );
    const s306 = a.periode.parCopro.find((c) => c.coproCode === "S306");
    expect(s306?.timbresEtLreHtCentimes).toBe(35024);
  }, 120_000);
});
