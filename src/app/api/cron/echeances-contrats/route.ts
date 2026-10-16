// GET /api/cron/echeances-contrats - rappel quotidien des échéances de contrats au binôme de
// chaque copro (module « Contrats & contrôles », REA-333, décision 8). Copie conforme de
// /api/cron/rappel-comptes-cs : handler MINCE, garde du secret -> service -> JSON du bilan.
// `Authorization: Bearer $CRON_SECRET` (envoyé par Vercel) ou `?secret=` à la main.
// CRON_SECRET absent -> 503, jamais ouverte.
//
// Sans CONTRATS_RAPPELS_SUJETS, la route tourne et n'envoie rien (armement sujet par sujet).
// Rejouer la route le même jour est sans effet : chaque rappel est tracé
// (intranet_rappels_envoyes) avant l'envoi, cf. services/contrats-copro/relances.

import { envoyerRappelsContrats } from "@/lib/services/contrats-copro/relances";

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
    const bilan = await envoyerRappelsContrats();
    console.log(
      `[cron:echeances-contrats] jour=${bilan.jour} sujets=${bilan.sujetsArmes.join(",") || "aucun"} candidats=${bilan.candidats}` +
        ` envoyés=${bilan.envoyes.length} déjà=${bilan.dejaEnvoyes.length} ignorés=${bilan.ignores.length} erreurs=${bilan.erreurs.length}`,
    );
    // Les échecs unitaires ne font pas échouer la route (ils sont dans le corps et les logs).
    return Response.json(bilan, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[cron:echeances-contrats] échec global : ${message}`);
    return Response.json({ erreur: "rappel_echoue", message }, { status: 500 });
  }
}
