// GET /mes-emails/pj?boite=…&message=<internetMessageId>&pj=<attachmentId>&inline=1|0 : une
// pièce jointe d'un mail de l'écran E-mails, relayée EN FLUX depuis Graph (REA-421,
// 27/10/2026). Aperçu (PDF en iframe, image) et téléchargement, quelle que soit la taille :
// avant, la pièce passait en base64 dans une action serveur, refusée par Vercel au-delà de
// 3,3 Mo. Mêmes gardes que les actions : session, module mail ouvert à la personne, boîte
// visible et, dans une boîte partagée, mail distribué à son binôme (super-admin exempté).

import type { NextRequest } from "next/server";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { fluxPieceJointeMail } from "@/lib/services/mes-emails/pieces-jointes";
import { lireParametresPj, reponseEchecPj, reponsePieceJointe, reponseRefusPj } from "@/lib/services/mes-emails/reponse-piece-jointe";
import { boiteDuMail } from "../gardes-boites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Une pièce de 25 Mo met quelques secondes à passer ; au-delà de 60 s, Graph a un souci.
export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<Response> {
  const q = lireParametresPj(req.nextUrl.searchParams);
  if (!q) return reponseRefusPj(400, "Paramètres invalides.");
  const g = await getGestionnaireCourant();
  if (!g) return reponseRefusPj(401, "Non connecté.");
  if (!g.email || !mailModuleActifPour(g.email)) return reponseRefusPj(403, "Le module mail n'est pas ouvert pour ce compte.");
  const boite = await boiteDuMail(g, q.boite, q.message);
  if (!boite) return reponseRefusPj(403, "Boîte non autorisée.");
  try {
    return reponsePieceJointe(await fluxPieceJointeMail(boite, q.message, q.pj), q.inline);
  } catch (e) {
    return reponseEchecPj(e, "mes-emails");
  }
}
