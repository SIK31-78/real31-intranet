// SMOKE (a la main, jamais en CI) : verifie le glissement de la date de CS sur la VRAIE
// base, confine a la copro bac a sable SE999. Se lance :
//   SMOKE_MANAGER_ID=<uuid du gestionnaire de SE999> //     node --env-file=.env.local ./node_modules/vitest/vitest.mjs run --config vitest.smoke.config.mts glissement-cs
// Le managerId vient de l'exterieur (la copro ne porte que les initiales de son equipe) :
// sans lui, le scope de l'adapter n'est pas exerce et le test ne prouve pas grand-chose.
// Le test remet SE999 dans son etat de depart a la fin.
import { describe, expect, it } from "vitest";

const CODE = "SE999";

describe("glissement de la date de CS sur la vraie base (SE999)", () => {
  it("cloture -> la prochaine date devient la derniere ; reouverture -> retour a l'etat initial", async () => {
    process.env.COPRO_SOURCE = "supabase";
    const { getCoproRepository, getOdjRepository } = await import("@/lib/adapters/router");
    const { cloturerOdj } = await import("./cloturer-odj");
    const { resoudreCleOdj } = await import("./resoudre-cle-odj");
    const { CLE_CS_GLISSE } = await import("@/lib/ports/odj-repository");

    const avant = await getCoproRepository().findByCode(CODE);
    if (!avant) throw new Error("SE999 introuvable");
    const managerId = process.env.SMOKE_MANAGER_ID ?? "";
    const { agDate } = await resoudreCleOdj(CODE, managerId);
    console.log("AVANT :", {
      agDate,
      derniereCsDate: avant.derniereCsDate,
      prochaineCsDate: avant.prochaineCsDate,
    });

    const params = { coproCode: CODE, agDateISO: agDate, initiales: "ZZ", managerId, maintenantISO: new Date().toISOString() };
    // Etat de depart garanti : ODJ ouvert.
    await cloturerOdj({ ...params, clore: false });

    await cloturerOdj({ ...params, clore: true });
    const apres = await getCoproRepository().findByCode(CODE);
    const marqueur = (await getOdjRepository().getEtat(CODE, agDate)).find((e) => e.champId === CLE_CS_GLISSE);
    console.log("APRES CLOTURE :", {
      derniereCsDate: apres?.derniereCsDate,
      prochaineCsDate: apres?.prochaineCsDate,
      marqueur: marqueur?.valeur,
    });
    expect(apres?.derniereCsDate).toBe((avant.prochaineCsDate ?? "").slice(0, 10));
    expect(apres?.prochaineCsDate).toBeUndefined();

    await cloturerOdj({ ...params, clore: false });
    const restaure = await getCoproRepository().findByCode(CODE);
    console.log("APRES REOUVERTURE :", {
      derniereCsDate: restaure?.derniereCsDate,
      prochaineCsDate: restaure?.prochaineCsDate,
    });
    expect(restaure?.derniereCsDate).toBe(avant.derniereCsDate);
    expect((restaure?.prochaineCsDate ?? "").slice(0, 10)).toBe((avant.prochaineCsDate ?? "").slice(0, 10));
  }, 60_000);
});
