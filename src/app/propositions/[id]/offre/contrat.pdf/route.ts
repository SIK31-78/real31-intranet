// GET /propositions/<id>/offre/contrat.pdf?ag=…&debut=…&duree=… : le contrat prospect en
// PDF, celui que l'offre joint au mail. Meme garde que la page (peutFaireOffre).

import { NextResponse, type NextRequest } from "next/server";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutFaireOffre, profilDe } from "@/lib/auth/roles";
import { preparerOffre } from "@/lib/services/proposition/propositions";
import { nomFichierContrat, pdfContrat } from "@/lib/services/contrat/pdf-contrat";
import { reponsePdf } from "@/lib/services/pdf/reponse-pdf";
import { lireOptionsOffre } from "../options";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const g = await getGestionnaireCourant();
  if (!g) return NextResponse.redirect(new URL("/dev-login", req.url));
  const sp = req.nextUrl.searchParams;
  const options = lireOptionsOffre({ ag: sp.get("ag") ?? undefined, debut: sp.get("debut") ?? undefined, duree: sp.get("duree") ?? undefined });
  let offre;
  try {
    offre = await preparerOffre(id, options, { nom: g.nomComplet });
  } catch (e) {
    if (/introuvable/.test((e as Error).message)) return new NextResponse("Proposition introuvable.", { status: 404 });
    throw e;
  }
  if (!peutFaireOffre(profilDe(g), offre.proposition.agence)) return new NextResponse("Réservé à la direction.", { status: 403 });
  if (!offre.champs) {
    return new NextResponse(offre.erreurContrat ?? `Il manque encore : ${offre.obstacles.join(", ")}.`, { status: 409 });
  }
  return reponsePdf(await pdfContrat(offre.champs), nomFichierContrat(offre.champs));
}
