// GET /odj/<id>/odj-cs.docx : l'ODJ du CS pre-rempli, en Word, a ouvrir dans Word.
// Lecture (meme perimetre que l'ecran /odj/<id>) ; aucune ecriture.

import { NextResponse, type NextRequest } from "next/server";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { genererOdjCsDocx } from "@/lib/services/odj/generer-odj-cs-docx";

export const dynamic = "force-dynamic";

const TYPE_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const g = await getGestionnaireCourant();
  if (!g) return NextResponse.redirect(new URL("/dev-login", req.url));

  let docx;
  try {
    docx = await genererOdjCsDocx(id, g.id);
  } catch (e) {
    console.error("[odj-cs.docx] rendu impossible :", (e as Error).message);
    return new NextResponse("Le document Word n'a pas pu être généré.", { status: 500 });
  }
  if (!docx) return new NextResponse("Copropriété introuvable.", { status: 404 });

  return new NextResponse(new Uint8Array(docx.contenu), {
    headers: {
      "content-type": TYPE_DOCX,
      // filename* (RFC 5987) pour les accents ; filename en repli ASCII.
      "content-disposition": `attachment; filename="${docx.nomFichier}"; filename*=UTF-8''${encodeURIComponent(docx.nomFichier)}`,
      "cache-control": "no-store",
    },
  });
}
