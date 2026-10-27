// GET /api/cron/tri-emails/<boite> - la tache planifiee du tri pour UNE boite (27/10/2026),
// ex. /api/cron/tri-emails/syndic2@real31.fr. Un cron Vercel par boite (vercel.json), decales
// d'une minute pour ne pas tourner en meme temps. Vercel documente les routes dynamiques pour
// ses crons, pas la query string : d'ou ce segment. Meme garde et meme traitement que
// /api/cron/tri-emails (tache.ts). Boite hors de la config : 200 sans rien faire.

import { executerTachePlanifiee } from "../tache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request, ctx: { params: Promise<{ boite: string }> }): Promise<Response> {
  const { boite } = await ctx.params;
  let adresse: string;
  try {
    adresse = decodeURIComponent(boite);
  } catch {
    return Response.json({ erreur: "boite_invalide" }, { status: 400 });
  }
  return executerTachePlanifiee(req, adresse);
}
