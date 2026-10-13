// GET /api/cron/rappel-comptes-cs - rappel quotidien aux comptables 10 jours avant le
// conseil syndical, si les comptes ne sont pas verifies (REA-140).
// Handler MINCE : garde du secret -> service -> JSON du bilan. Meme garde que
// /api/cron/linear : `Authorization: Bearer $CRON_SECRET` (envoye par Vercel) ou
// `?secret=` pour un declenchement a la main. CRON_SECRET absent -> 503, jamais ouverte.
//
// Rejouer la route le meme jour est sans effet : chaque rappel est trace
// (intranet_rappels_envoyes) avant l'envoi, cf. services/coproprietes/rappeler-comptes-avant-cs.

import { rappelerComptesAvantCs } from "@/lib/services/coproprietes/rappeler-comptes-avant-cs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorise(req: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  if (req.headers.get("authorization") === `Bearer ${attendu}`) return true;
  return new URL(req.url).searchParams.get("secret") === attendu;
}

export async function GET(req: Request): Promise<Response> {
  if (!process.env.CRON_SECRET) {
    return Response.json(
      { erreur: "cron_non_configure", message: "CRON_SECRET absent : la route est fermée." },
      { status: 503 },
    );
  }
  if (!autorise(req)) return Response.json({ erreur: "non_autorise" }, { status: 401 });

  try {
    const bilan = await rappelerComptesAvantCs();
    console.log(
      `[cron:rappel-comptes-cs] jour=${bilan.jour} candidats=${bilan.candidats} envoyés=${bilan.envoyes.length}` +
        ` déjà=${bilan.dejaEnvoyes.length} ignorés=${bilan.ignores.length} erreurs=${bilan.erreurs.length}`,
    );
    // Les echecs unitaires ne font pas echouer la route (ils sont dans le corps et les logs).
    return Response.json(bilan, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[cron:rappel-comptes-cs] échec global : ${message}`);
    return Response.json({ erreur: "rappel_echoue", message }, { status: 500 });
  }
}
