// GET /api/cron/linear - synchro quotidienne des remontees collaborateurs avec Linear.
// Handler MINCE : garde du secret -> service -> JSON du bilan.
//
// DECLENCHEMENT : cron Vercel (cf. vercel.json, 6h00 UTC). Vercel envoie
// `Authorization: Bearer $CRON_SECRET` des que la variable existe sur le projet ;
// sans en-tete valide, la route repond 401. On accepte aussi `?secret=` pour pouvoir
// la declencher a la main depuis scripts/ (meme secret, meme garde).
//
// POURQUOI UNE GARDE ET PAS UNE SESSION : un cron n'a pas de session NextAuth. Le
// secret partage est le seul moyen d'authentifier Vercel. CRON_SECRET absent -> la
// route refuse TOUT (503), elle ne s'ouvre jamais par defaut.

import { synchroniserLinear } from "@/lib/services/feedback/synchroniser-linear";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// La synchro fait N appels Linear (un par remontee a pousser) : on laisse de la marge
// au-dela des 10 s par defaut d'une fonction Vercel.
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
    const bilan = await synchroniserLinear();
    // On loggue le resume : c'est ce qu'on lira dans les logs Vercel apres coup.
    console.log(
      `[cron:linear] actif=${bilan.actif} poussés=${bilan.pousses.length} réalignés=${bilan.realignes.length}` +
        ` renommés=${bilan.renommes.length} archivés=${bilan.archivees}` +
        ` ignorés=${bilan.ignorees} orphelins=${bilan.orphelins.length} erreurs=${bilan.erreurs.length}`,
    );
    // Les echecs unitaires ne font PAS echouer la route : Vercel retenterait tout le
    // lot alors que la majorite est passee. Ils sont dans le corps, et dans les logs.
    return Response.json(bilan, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[cron:linear] échec global : ${message}`);
    return Response.json({ erreur: "synchro_echouee", message }, { status: 500 });
  }
}
