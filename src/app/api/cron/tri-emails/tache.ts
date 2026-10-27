// La tache planifiee du tri des e-mails (ADR-046), pour UNE boite triee. Partagee par
// GET /api/cron/tri-emails (boite par `?boite=`, sinon la premiere de la config : c'est le
// cron Vercel d'origine) et GET /api/cron/tri-emails/<boite> (un cron par boite dans
// vercel.json : Vercel documente les routes dynamiques pour ses crons, pas la query string).
//
// Garde du secret : Vercel envoie `Authorization: Bearer $CRON_SECRET` ; sans en-tete valide,
// 401. `?secret=` est accepte pour un declenchement a la main, HORS production seulement
// (27/10/2026 : un secret dans l'URL finit dans les journaux d'acces). CRON_SECRET absent ->
// la route refuse tout (503).
//
// Boite demandee hors de la config : 200 et rien (le cron de syndic2 tourne avant que syndic2
// soit dans MAIL_TRI_BOITES ; ce n'est pas une panne). Adresse mal formee : 400.
//
// DEUX ETAPES INDEPENDANTES (27/10/2026) : la reconciliation, PUIS si l'automatique est
// ouvert pour la boite (MAIL_TRI_AUTO=on ET `automatique` de sa config) le rangement
// automatique (ranger-auto.ts). Chacune a son propre try : l'automatique tourne meme si la
// reconciliation a echoue. Apres la reconciliation, un mail remis dans la file a la main est
// deja marque annule, il n'est donc pas re-range. 200 des qu'une etape a tourne, 500
// seulement si les deux echouent. SANS EFFET tant que l'ecriture n'est pas ouverte pour la
// boite : les services rendent un bilan vide.

import { timingSafeEqual } from "node:crypto";
import { boitesTri, type BoiteTriConfig } from "@/lib/domain/mail-gate";
import { signalerException } from "@/lib/observabilite";
import { depsParDefaut } from "@/lib/services/tri-emails/ranger";
import { reconcilierRangements, type BilanReconciliation } from "@/lib/services/tri-emails/reconcilier";
import { rangerAutomatiquement, type BilanAutomatique } from "@/lib/services/tri-emails/ranger-auto";

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

/** La boite a traiter : celle demandee (validee contre la config), sinon la premiere. */
function boiteATraiter(demandee: string | null): { config: BoiteTriConfig | null; invalide: boolean } {
  const voulue = (demandee ?? "").trim().toLowerCase();
  if (voulue && voulue !== "echantillon" && !/^[^\s@/]+@[^\s@/]+$/.test(voulue)) return { config: null, invalide: true };
  const boites = boitesTri();
  return { config: voulue ? (boites.find((b) => b.boite === voulue) ?? null) : (boites[0] ?? null), invalide: false };
}

export async function executerTachePlanifiee(req: Request, demandee: string | null): Promise<Response> {
  if (!process.env.CRON_SECRET) {
    return Response.json({ erreur: "cron_non_configure", message: "CRON_SECRET absent : la route est fermée." }, { status: 503 });
  }
  if (!autorise(req)) return Response.json({ erreur: "non_autorise" }, { status: 401 });

  const { config, invalide } = boiteATraiter(demandee);
  if (invalide) return Response.json({ erreur: "boite_invalide" }, { status: 400 });
  if (!config) return Response.json({ boite: demandee, ignoree: "boîte absente de la config du tri" });
  const boite = config.boite;
  const deps = depsParDefaut(config);

  let reconciliation: Etape<BilanReconciliation>;
  try {
    const bilan = await reconcilierRangements(deps);
    console.log(`[cron:tri-emails] ${boite} vérifiés=${bilan.verifies} remis_en_file=${bilan.remisEnFile} déplacés=${bilan.deplaces} échecs=${bilan.echecs}`);
    reconciliation = bilan;
  } catch (e) {
    console.error(`[cron:tri-emails] ${boite} réconciliation en échec : ${messageDe(e)}`);
    signalerException(e, { source: "cron-tri-emails", detail: { etape: "reconciliation", boite } });
    reconciliation = { erreur: messageDe(e) };
  }

  let automatique: Etape<BilanAutomatique>;
  try {
    const bilan = await rangerAutomatiquement(deps);
    if (bilan.actif) {
      console.log(
        `[cron:tri-emails] ${boite} auto rangés=${bilan.ranges} échecs=${bilan.echecs} reportés=${bilan.reportes} examinés=${bilan.examines}` +
          ` pdf_lus=${bilan.pj.lus} pdf_rangés=${bilan.pj.ranges} pdf_déjà_lus=${bilan.pj.dejaLus} pdf_reportés=${bilan.pj.reportes}`,
      );
    }
    automatique = bilan;
  } catch (e) {
    console.error(`[cron:tri-emails] ${boite} rangement automatique en échec : ${messageDe(e)}`);
    signalerException(e, { source: "cron-tri-emails", detail: { etape: "automatique", boite } });
    automatique = { erreur: messageDe(e) };
  }

  const toutEchoue = "erreur" in reconciliation && "erreur" in automatique;
  return Response.json({ boite, reconciliation, automatique }, { status: toutEchoue ? 500 : 200 });
}
