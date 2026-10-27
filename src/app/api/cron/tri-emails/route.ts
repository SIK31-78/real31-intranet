// GET /api/cron/tri-emails - tache planifiee du tri (ADR-046) : suivi des mails glisses a la
// main dans Outlook, puis rangement automatique. Handler MINCE : tout est dans tache.ts.
//
// DECLENCHEMENT : cron Vercel toutes les 5 minutes (vercel.json). Sans parametre, la PREMIERE
// boite de la config (le cron d'origine, celui de syndic4) ; `?boite=` pour une autre, a la
// main. Les autres boites ont leur propre cron : /api/cron/tri-emails/<boite> (27/10/2026).

import { executerTachePlanifiee } from "./tache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Un appel Graph par rangement relu (50 au plus, 4 a la fois, 15 s de budget), puis 30
// rangements automatiques au plus dans un budget de 25 s (ranger-auto.ts), lecture des PDF
// comprise (8 mails au plus, une lecture ne commence que si elle finit dans le budget) :
// tient dans 60 s.
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return executerTachePlanifiee(req, new URL(req.url).searchParams.get("boite"));
}
