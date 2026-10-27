// GET /tri-emails/pj?boite=…&message=<internetMessageId>&pj=<attachmentId>&inline=1|0 :
// l'aperçu d'une pièce jointe d'un mail de la file du tri, relayé EN FLUX depuis Graph
// (REA-421, 27/10/2026). Même garde que les actions du tri (gardeTri) : la boîte doit être
// celle de l'équipe syndic d'une agence de la personne, ou un super-admin. Une route à part de
// celle des E-mails plutôt qu'une route commune : chaque écran garde sa garde, sans aiguillage.

import type { NextRequest } from "next/server";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { droitsTri } from "@/lib/auth/roles";
import { boiteTriAccessible } from "@/lib/services/tri-emails/acces";
import { fluxPieceJointeTri } from "@/lib/services/tri-emails/pieces-jointes";
import { lireParametresPj, reponseEchecPj, reponsePieceJointe, reponseRefusPj } from "@/lib/services/mes-emails/reponse-piece-jointe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<Response> {
  const q = lireParametresPj(req.nextUrl.searchParams);
  if (!q?.boite) return reponseRefusPj(400, "Paramètres invalides.");
  const g = await getGestionnaireCourant();
  if (!g) return reponseRefusPj(401, "Non connecté.");
  const config = await boiteTriAccessible(g, droitsTri(g), q.boite);
  if (!config) return reponseRefusPj(403, "Le tri de cette boîte est réservé à l'équipe syndic de son agence.");
  try {
    return reponsePieceJointe(await fluxPieceJointeTri(config.boite, q.message, q.pj), q.inline);
  } catch (e) {
    return reponseEchecPj(e, "tri-emails");
  }
}
