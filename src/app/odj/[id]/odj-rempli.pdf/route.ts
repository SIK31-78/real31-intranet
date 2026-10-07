// GET /odj/<id>/odj-rempli.pdf : le MEME document que odj-rempli.docx, en PDF (ADR-012 v3 :
// un HTML A4 autonome rendu par Chromium). Pour envoyer l'ODJ au CS sans qu'il soit
// modifiable, et pour la piece jointe du mail a venir (REA-146).
// Lecture seule, meme perimetre que l'ecran /odj/<id>.

import { NextResponse, type NextRequest } from "next/server";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { genererOdjRempliPdf } from "@/lib/services/odj/generer-odj-rempli";
import { reponseEchecPdf, reponsePdf } from "@/lib/services/pdf/reponse-pdf";

export const dynamic = "force-dynamic";
// Chromium demarre a froid en quelques secondes sur la fonction : plus que les 10 s par defaut.
export const maxDuration = 60;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const g = await getGestionnaireCourant();
  if (!g) return NextResponse.redirect(new URL("/dev-login", req.url));

  try {
    const pdf = await genererOdjRempliPdf(id, g.id);
    if (!pdf) return new NextResponse("Copropriété introuvable.", { status: 404 });
    return reponsePdf(pdf.contenu, pdf.nomFichier);
  } catch (e) {
    return reponseEchecPdf(e, "odj-rempli.pdf");
  }
}
