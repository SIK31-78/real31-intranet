// SMOKE (a la main, lecture seule) : ce que getSchedule rend vraiment pour l'agenda du
// compte de service, avec et sans l'en-tete Prefer. Sert a verifier le FUSEAU des
// scheduleItems - le calendrier AG/CS affichait tout decale de deux heures.
//   SMOKE_BOITE=<email> node --env-file=.env.local \
//     ./node_modules/vitest/vitest.mjs run --config vitest.smoke.config.mts plages-occupees --disableConsoleIntercept
import { describe, expect, it } from "vitest";

describe("getSchedule : fuseau des scheduleItems", () => {
  it("compare la reponse avec et sans Prefer outlook.timezone", async () => {
    const boite = process.env.SMOKE_BOITE;
    if (!boite) return console.log("SMOKE_BOITE absent : mesure impossible");
    const { GRAPH, graphFetch, jetonGraph } = await import("../mail/graph-auth");
    const tk = await jetonGraph();

    const corps = JSON.stringify({
      schedules: [boite],
      startTime: { dateTime: "2026-09-01T00:00:00", timeZone: "Europe/Paris" },
      endTime: { dateTime: "2026-09-15T00:00:00", timeZone: "Europe/Paris" },
      availabilityViewInterval: 60,
    });

    for (const avecPrefer of [false, true]) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${tk}`,
        "Content-Type": "application/json",
      };
      if (avecPrefer) headers.Prefer = 'outlook.timezone="Europe/Paris"';
      const r = await graphFetch(
        `${GRAPH}/users/${encodeURIComponent(boite)}/calendar/getSchedule`,
        { method: "POST", headers, body: corps },
        15_000,
      );
      const brut = await r.text();
      console.log(`\n--- Prefer=${avecPrefer} -> HTTP ${r.status} ---`);
      if (!r.ok) {
        console.log(brut.slice(0, 400));
        continue;
      }
      const j = JSON.parse(brut) as {
        value?: Array<{
          error?: { responseCode?: string };
          scheduleItems?: Array<{
            status?: string;
            start?: { dateTime?: string; timeZone?: string };
            end?: { dateTime?: string };
          }>;
        }>;
      };
      console.log("error:", j.value?.[0]?.error?.responseCode ?? "aucune");
      const items = j.value?.[0]?.scheduleItems ?? [];
      const parStatut = new Map<string, number>();
      for (const it of items) parStatut.set(it.status ?? "?", (parStatut.get(it.status ?? "?") ?? 0) + 1);
      console.log(`${items.length} scheduleItems :`, [...parStatut].map(([k, n]) => `${k}=${n}`).join(" "));
      const retenus = items.filter(
        (it) => it.status === "busy" || it.status === "oof" || it.status === "tentative",
      );
      for (const it of retenus.slice(0, 5)) {
        console.log(`  RETENU ${it.status} ${it.start?.dateTime} -> ${it.end?.dateTime} (tz=${it.start?.timeZone})`);
      }
    }
    expect(true).toBe(true);
  }, 120_000);
});
