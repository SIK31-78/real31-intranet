// GET /api/cron/tri-emails - suivi des mails glisses a la main dans Outlook (ADR-046).
// Handler MINCE : garde du secret -> service -> JSON du bilan. Meme modele que
// /api/cron/linear.
//
// DECLENCHEMENT : cron Vercel toutes les 5 minutes (vercel.json). Vercel envoie
// `Authorization: Bearer $CRON_SECRET` ; sans en-tete valide, 401. `?secret=` est accepte
// pour un declenchement a la main. CRON_SECRET absent -> la route refuse tout (503).
//
// SANS EFFET tant que l'ecriture du tri n'est pas ouverte (MAIL_TRI_ECRITURE=on) ou que la
// boite n'est pas configuree : le service rend un bilan vide.

import { reconcilierRangements } from "@/lib/services/tri-emails/reconcilier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Un appel Graph par rangement relu (50 au plus, 4 a la fois) : de la marge au-dela de 10 s.
export const maxDuration = 60;

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
    const bilan = await reconcilierRangements();
    console.log(`[cron:tri-emails] vérifiés=${bilan.verifies} remis_en_file=${bilan.remisEnFile} déplacés=${bilan.deplaces}`);
    return Response.json(bilan, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[cron:tri-emails] échec : ${message}`);
    return Response.json({ erreur: "reconciliation_echouee", message }, { status: 500 });
  }
}
