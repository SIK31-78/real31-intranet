// GET /api/cron/tri-emails - suivi des mails glisses a la main dans Outlook (ADR-046).
// Handler MINCE : garde du secret -> services -> JSON du bilan. Meme modele que
// /api/cron/linear.
//
// DECLENCHEMENT : cron Vercel toutes les 5 minutes (vercel.json). Vercel envoie
// `Authorization: Bearer $CRON_SECRET` ; sans en-tete valide, 401. `?secret=` est accepte
// pour un declenchement a la main, HORS production seulement (27/10/2026 : un secret dans
// l'URL finit dans les journaux d'acces). CRON_SECRET absent -> la route refuse tout (503).
//
// SANS EFFET tant que l'ecriture du tri n'est pas ouverte (MAIL_TRI_ECRITURE=on) ou que la
// boite n'est pas configuree : les services rendent un bilan vide.
//
// DEUX ETAPES INDEPENDANTES (27/10/2026) : la reconciliation, PUIS si MAIL_TRI_AUTO=on (coupe
// par defaut) le rangement automatique des mails de syndic4 (ranger-auto.ts : piste « sure »
// depuis le 20/10, piste faible par le nom ou l'adresse et lecture des PDF depuis le 26/10).
// Chacune a son propre try : l'automatique tourne meme si la reconciliation a echoue (avant,
// une panne Graph sur la premiere privait syndic4 de rangement pendant toute la panne).
// Apres la reconciliation, un mail remis dans la file a la main est deja marque annule, il
// n'est donc pas re-range. 200 des qu'une etape a tourne, 500 seulement si les deux echouent.

import { timingSafeEqual } from "node:crypto";
import { signalerException } from "@/lib/observabilite";
import { reconcilierRangements, type BilanReconciliation } from "@/lib/services/tri-emails/reconcilier";
import { rangerAutomatiquement, type BilanAutomatique } from "@/lib/services/tri-emails/ranger-auto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Un appel Graph par rangement relu (50 au plus, 4 a la fois, 15 s de budget), puis 30
// rangements automatiques au plus dans un budget de 25 s (ranger-auto.ts), lecture des PDF
// comprise (8 mails au plus, une lecture ne commence que si elle finit dans le budget) :
// tient dans 60 s.
export const maxDuration = 60;

/** Comparaison en temps constant : longueurs egales d'abord (timingSafeEqual l'exige). */
function secretsEgaux(donne: string, attendu: string): boolean {
  const a = Buffer.from(donne);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}

function autorise(req: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  const entete = req.headers.get("authorization") ?? "";
  if (entete.startsWith("Bearer ") && secretsEgaux(entete.slice("Bearer ".length), attendu)) return true;
  if (process.env.VERCEL_ENV === "production") return false;
  const secret = new URL(req.url).searchParams.get("secret");
  return secret !== null && secretsEgaux(secret, attendu);
}

type Etape<B> = B | { erreur: string };

const messageDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

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

  let reconciliation: Etape<BilanReconciliation>;
  try {
    const bilan = await reconcilierRangements();
    console.log(`[cron:tri-emails] vérifiés=${bilan.verifies} remis_en_file=${bilan.remisEnFile} déplacés=${bilan.deplaces} échecs=${bilan.echecs}`);
    reconciliation = bilan;
  } catch (e) {
    console.error(`[cron:tri-emails] réconciliation en échec : ${messageDe(e)}`);
    signalerException(e, { source: "cron-tri-emails", detail: { etape: "reconciliation" } });
    reconciliation = { erreur: messageDe(e) };
  }

  let automatique: Etape<BilanAutomatique>;
  try {
    const bilan = await rangerAutomatiquement();
    if (bilan.actif) {
      console.log(
        `[cron:tri-emails] auto rangés=${bilan.ranges} échecs=${bilan.echecs} reportés=${bilan.reportes} examinés=${bilan.examines}` +
          ` pdf_lus=${bilan.pj.lus} pdf_rangés=${bilan.pj.ranges} pdf_déjà_lus=${bilan.pj.dejaLus} pdf_reportés=${bilan.pj.reportes}`,
      );
    }
    automatique = bilan;
  } catch (e) {
    console.error(`[cron:tri-emails] rangement automatique en échec : ${messageDe(e)}`);
    signalerException(e, { source: "cron-tri-emails", detail: { etape: "automatique" } });
    automatique = { erreur: messageDe(e) };
  }

  const toutEchoue = "erreur" in reconciliation && "erreur" in automatique;
  return Response.json({ reconciliation, automatique }, { status: toutEchoue ? 500 : 200 });
}
