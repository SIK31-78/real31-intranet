// GET /odj/<id>/odj-rempli.docx : l'ODJ du CS **tel qu'il a ete rempli en ligne**, en Word.
// A ne pas confondre avec /odj/<id>/odj-cs.docx, qui rend le modele du cabinet PRE-REMPLI,
// avec ses blancs a completer en reunion (REA-62). Lecture seule, meme perimetre que
// l'ecran /odj/<id>.

import { NextResponse, type NextRequest } from "next/server";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { genererOdjRempliDocx } from "@/lib/services/odj/generer-odj-rempli";
import { signalerException } from "@/lib/observabilite";

export const dynamic = "force-dynamic";

const TYPE_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const g = await getGestionnaireCourant();
  if (!g) return NextResponse.redirect(new URL("/dev-login", req.url));

  let docx;
  try {
    docx = await genererOdjRempliDocx(id, g.id);
  } catch (e) {
    signalerException(e, { source: "odj-rempli.docx" });
    console.error("[odj-rempli.docx] rendu impossible :", (e as Error).message);
    return new NextResponse("Le document Word n'a pas pu être généré.", { status: 500 });
  }
  if (!docx) return new NextResponse("Copropriété introuvable.", { status: 404 });

  return new NextResponse(new Uint8Array(docx.contenu), {
    headers: {
      "content-type": TYPE_DOCX,
      // filename* (RFC 5987) pour les accents ; filename en repli ASCII.
      "content-disposition": `attachment; filename="${ascii(docx.nomFichier)}"; filename*=UTF-8''${encodeURIComponent(docx.nomFichier)}`,
      "cache-control": "no-store",
    },
  });
}

/** Repli ASCII du nom de fichier, pour les navigateurs qui ignorent `filename*`. */
function ascii(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/"/g, "'");
}
