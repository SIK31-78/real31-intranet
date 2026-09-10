// SMOKE de MESURE (a la main, lecture seule) : ce que coute le LOGIN eStale, paye par
// CHAQUE nouvelle instance serverless avant sa premiere lecture GraphQL (le cookie de
// session vit dans une variable de module, cf. client.ts). Sert a chiffrer le "premier
// affichage lent" en production.
//   node --env-file=.env.local ./node_modules/vitest/vitest.mjs run --config vitest.smoke.config.mts perf-login --disableConsoleIntercept
import { describe, expect, it } from "vitest";

describe("cout du login eStale", () => {
  it("chronometre le login puis une lecture a session chaude", async () => {
    const base = process.env.ESTALE_BASE_URL;
    if (!base) return console.log("ESTALE_BASE_URL absent : mesure impossible");

    const t0 = Date.now();
    const res = await fetch(`${base}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: process.env.ESTALE_EMAIL,
        password: process.env.ESTALE_PASSWORD,
      }),
    });
    const login1 = Date.now() - t0;
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    console.log(`login eStale (1er)            ${String(login1).padStart(6)} ms  HTTP ${res.status}`);

    const t1 = Date.now();
    const r2 = await fetch(`${base}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: process.env.ESTALE_EMAIL,
        password: process.env.ESTALE_PASSWORD,
      }),
    });
    console.log(`login eStale (2e)             ${String(Date.now() - t1).padStart(6)} ms  HTTP ${r2.status}`);

    for (let i = 0; i < 3; i++) {
      const t = Date.now();
      const g = await fetch(`${base}/graphql/intranet`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ query: "{ __typename }" }),
      });
      console.log(`requete GraphQL (session chaude) ${String(Date.now() - t).padStart(6)} ms  HTTP ${g.status}`);
    }
    expect(res.status).toBeLessThan(500);
  }, 120_000);
});
