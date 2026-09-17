// GET /contrat/<code>/contrat.pdf?ag=…&honoraires=… : le contrat de syndic d'une copropriete
// en PDF, avec les memes ajustements que l'apercu imprimable. Lecture, comme l'apercu.

import { NextResponse, type NextRequest } from "next/server";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getContrat } from "@/lib/services/contrat/get-contrat";
import { nomFichierContrat, pdfContrat } from "@/lib/services/contrat/pdf-contrat";
import { reponseEchecPdf, reponsePdf } from "@/lib/services/pdf/reponse-pdf";
import { lireOptionsContrat } from "../options";

export const dynamic = "force-dynamic";
// Chromium demarre a froid en quelques secondes sur la fonction : plus que les 10 s par defaut.
export const maxDuration = 60;

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await ctx.params;
  const g = await getGestionnaireCourant();
  if (!g) return NextResponse.redirect(new URL("/dev-login", req.url));
  const sp = req.nextUrl.searchParams;
  const lire = (k: string) => sp.get(k) ?? undefined;
  let champs;
  try {
    champs = await getContrat(
      code,
      lireOptionsContrat({ ag: lire("ag"), debut: lire("debut"), fin: lire("fin"), honoraires: lire("honoraires"), timbres: lire("timbres"), frais: lire("frais") }),
    );
  } catch (e) {
    const message = (e as Error).message;
    if (/introuvable/.test(message)) return new NextResponse("Copropriété introuvable.", { status: 404 });
    return new NextResponse(message, { status: 409 });
  }
  try {
    return reponsePdf(await pdfContrat(champs), nomFichierContrat(champs));
  } catch (e) {
    return reponseEchecPdf(e, "contrat.pdf");
  }
}
