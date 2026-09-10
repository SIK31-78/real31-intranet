// SMOKE de PERFORMANCE (a la main) : chronometre, sur la VRAIE base, chaque service que
// rendent les pages les plus visitees. Lecture seule. Sert a savoir ce qui coute, sans
// confondre le cout des donnees avec la compilation Turbopack du serveur de dev.
//   SMOKE_MANAGER_ID=<uuid> node --env-file=.env.local \
//     ./node_modules/vitest/vitest.mjs run --config vitest.smoke.config.mts perf-accueil
import { describe, expect, it } from "vitest";

async function chrono<T>(nom: string, f: () => Promise<T>): Promise<number> {
  const t = Date.now();
  let taille = "";
  try {
    const r = await f();
    taille = Array.isArray(r) ? ` (${r.length} el.)` : "";
  } catch (e) {
    taille = ` ERREUR ${(e as Error).message.slice(0, 60)}`;
  }
  const ms = Date.now() - t;
  console.log(`${nom.padEnd(38)} ${String(ms).padStart(6)} ms${taille}`);
  return ms;
}

describe("cout des services (vraie base)", () => {
  it("chronometre l'accueil, la liste des copros, la fiche et le calendrier", async () => {
    process.env.COPRO_SOURCE = "supabase";
    const managerId = process.env.SMOKE_MANAGER_ID ?? "";
    const today = new Date().toISOString().slice(0, 10);

    const { getAgSemaine } = await import("@/lib/services/affaires/get-ag-semaine");
    const { getAffairesEnCours } = await import("@/lib/services/affaires/get-affaires-en-cours");
    const { getAnnoncesActives } = await import("@/lib/services/annonces/get-annonces-actives");
    const { listerRecapsEnRetard } = await import("@/lib/services/compta/recaps-en-retard");
    const { getCoproRepository } = await import("@/lib/adapters/router");
    const { getFicheCopro } = await import("@/lib/services/fiche-copro/get-fiche-copro");

    console.log("\n--- 1er passage (caches froids) ---");
    await chrono("getAgSemaine", () => getAgSemaine(managerId));
    await chrono("getAffairesEnCours", () => getAffairesEnCours(managerId));
    await chrono("getAnnoncesActives", () => getAnnoncesActives({}));
    await chrono("listerRecapsEnRetard", () =>
      listerRecapsEnRetard({ managerId, estComptable: false }, today),
    );
    await chrono("coproRepository.listerToutes", () => getCoproRepository().listerToutes());
    await chrono("getFicheCopro(S215)", () => getFicheCopro("S215", managerId, new Date().toISOString().slice(0, 10)));

    console.log("\n--- 2e passage (caches chauds) ---");
    await chrono("getAgSemaine", () => getAgSemaine(managerId));
    await chrono("getAffairesEnCours", () => getAffairesEnCours(managerId));
    await chrono("coproRepository.listerToutes", () => getCoproRepository().listerToutes());
    await chrono("getFicheCopro(S215)", () => getFicheCopro("S215", managerId, new Date().toISOString().slice(0, 10)));

    expect(true).toBe(true);
  }, 300_000);
});
