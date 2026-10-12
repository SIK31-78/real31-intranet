// GET /api/cron/annuaire-crypto - verifie chaque matin que l'annuaire des expediteurs
// Crypto a ete synchronise la nuit (REA-291), et alerte par mail sinon.
// Handler MINCE : garde du secret -> service -> JSON du diagnostic. Meme modele que
// /api/cron/linear.
//
// DECLENCHEMENT : cron Vercel (vercel.json, 6h00 UTC, apres la synchro de 4 h heure de
// Paris). `Authorization: Bearer $CRON_SECRET`, ou `?secret=` a la main. CRON_SECRET
// absent -> la route refuse tout (503).
//
// Le mail part a ALERTES_EMAIL, depuis sa propre boite. Variable absente : diagnostic
// seul, sans mail (le bandeau de l'ecran de tri reste la).

import { surveillerAnnuaire } from "@/lib/services/synchro/surveiller-annuaire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorise(req: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  const entete = req.headers.get("authorization");
  if (entete === `Bearer ${attendu}`) return true;
  return new URL(req.url).searchParams.get("secret") === attendu;
}

export async function GET(req: Request): Promise<Response> {
  if (!process.env.CRON_SECRET) {
    return Response.json(
      { erreur: "cron_non_configure", message: "CRON_SECRET absent : la route est fermée." },
      { status: 503 },
    );
  }
  if (!autorise(req)) {
    return Response.json({ erreur: "non_autorise" }, { status: 401 });
  }

  try {
    const r = await surveillerAnnuaire();
    console.log(`[cron:annuaire-crypto] alerte=${r.alerte} mail=${r.alerteEnvoyee} ${r.raisons.join(" | ")}`);
    return Response.json(r, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[cron:annuaire-crypto] échec : ${message}`);
    return Response.json({ erreur: "surveillance_echouee", message }, { status: 500 });
  }
}
