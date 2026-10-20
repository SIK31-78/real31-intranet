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
//
// PUIS, si MAIL_TRI_AUTO=on (coupe par defaut) : rangement automatique des mails a piste
// « sure » de syndic4 (ranger-auto.ts, decision du 20/10/2026). Apres la reconciliation : un
// mail remis dans la file a la main est deja marque annule, il n'est donc pas re-range.

import { reconcilierRangements } from "@/lib/services/tri-emails/reconcilier";
import { rangerAutomatiquement, type BilanAutomatique } from "@/lib/services/tri-emails/ranger-auto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Un appel Graph par rangement relu (50 au plus, 4 a la fois), puis 30 rangements
// automatiques au plus dans un budget de 25 s (ranger-auto.ts) : tient dans 60 s.
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
    // L'automatique ne fait jamais echouer la reconciliation : son erreur est rendue a part.
    let automatique: BilanAutomatique | { erreur: string };
    try {
      automatique = await rangerAutomatiquement();
      if (automatique.actif) {
        console.log(
          `[cron:tri-emails] auto rangés=${automatique.ranges} échecs=${automatique.echecs} reportés=${automatique.reportes} examinés=${automatique.examines}`,
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[cron:tri-emails] rangement automatique en échec : ${message}`);
      automatique = { erreur: message };
    }
    return Response.json({ ...bilan, automatique }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[cron:tri-emails] échec : ${message}`);
    return Response.json({ erreur: "reconciliation_echouee", message }, { status: 500 });
  }
}
