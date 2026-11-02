"use server";

// « Pour BPO » (02/11/2026, Emmanuel) : déposer des pièces jointes d'un mail dans le dossier
// SharePoint de dépôt des factures Crypto pour BPO. Fichier à part de actions.ts.
//
// Gardes : module mail ouvert à la personne ; le mail est dans une de SES boîtes et, dans une
// boîte partagée, distribué à l'un de ses binômes (boiteDuMail, la garde des pièces jointes).
// Le dossier visé est recalculé côté serveur ; les initiales viennent de la session. Pas de
// dépôt en incarnation : le fichier partirait dans le dossier de la personne incarnée.

import { z } from "zod";
import { echec, echecDepuis, type Res } from "@/lib/actions/resultat";
import { getGestionnaireCourant, incarnationEnCours, mailModuleActifPour } from "@/lib/auth/session";
import { codeAgence } from "@/lib/services/agences/resoudre-agence";
import { cibleBpo, deposerPourBpo, type CibleBpo, type PieceDeposee } from "@/lib/services/mes-emails/depot-bpo";
import { boiteDuMail } from "./gardes-boites";

const zBoite = z.string().trim().min(1).max(320);
const zId = z.string().trim().min(1).max(600);
const zCopro = z.string().trim().max(40);
// Id d'attachment Graph : du base64, jamais autre chose (il part dans une URL Graph).
const zAttachmentId = z.string().min(1).max(600).regex(/^[A-Za-z0-9_\-=+/]+$/);

const INDISPONIBLE = "Le module e-mails n'est pas disponible.";
const REFUS_MAIL = "Ce mail n'est pas dans tes boîtes.";

type Session = NonNullable<Awaited<ReturnType<typeof getGestionnaireCourant>>>;

async function session(): Promise<Session | null> {
  const g = await getGestionnaireCourant();
  return g?.email && mailModuleActifPour(g.email) ? g : null;
}

/** Le dossier où les pièces partiraient (dossier daté, sous-dossiers d'initiales, alerte ESTALE). */
export async function cibleBpoAction(input: unknown): Promise<Res<CibleBpo>> {
  const v = z.object({ boite: zBoite, emailId: zId, coproCode: zCopro }).safeParse(input);
  if (!v.success) return echec("Données invalides.");
  const g = await session();
  if (!g) return echec(INDISPONIBLE);
  if (!(await boiteDuMail(g, v.data.boite, v.data.emailId))) return echec(REFUS_MAIL);
  try {
    const r = await cibleBpo({ coproCode: v.data.coproCode, agencePersonne: await codeAgence(g.agencyId).catch(() => undefined), initiales: g.initiales });
    return r.ok ? { ok: true, donnees: r.cible } : echec(r.motif);
  } catch (e) {
    return echecDepuis(e, "mes-emails");
  }
}

/** Dépose les pièces choisies dans « <dossier daté>/<sousDossier> ». */
export async function deposerBpoAction(input: unknown): Promise<Res<{ dossier: string; pieces: PieceDeposee[] }>> {
  const v = z
    .object({
      boite: zBoite,
      emailId: zId,
      coproCode: zCopro,
      pjIds: z.array(zAttachmentId).min(1).max(10),
      sousDossier: z.string().trim().min(1).max(60),
      confirmeEstale: z.boolean().default(false),
    })
    .safeParse(input);
  if (!v.success) return echec("Choisis au moins une pièce jointe (10 au plus) et un dossier.");
  const g = await session();
  if (!g) return echec(INDISPONIBLE);
  if (await incarnationEnCours()) return echec("Pas de dépôt pendant « Changer de gestionnaire » : il partirait au nom de la personne incarnée.");
  const boite = await boiteDuMail(g, v.data.boite, v.data.emailId);
  if (!boite) return echec(REFUS_MAIL);
  try {
    const r = await deposerPourBpo({
      boite,
      internetMessageId: v.data.emailId,
      pjIds: [...new Set(v.data.pjIds)],
      sousDossier: v.data.sousDossier,
      coproCode: v.data.coproCode,
      agencePersonne: await codeAgence(g.agencyId).catch(() => undefined),
      initiales: g.initiales,
      confirmeEstale: v.data.confirmeEstale,
    });
    return r.ok ? { ok: true, donnees: { dossier: r.dossier, pieces: r.pieces } } : echec(r.motif);
  } catch (e) {
    return echecDepuis(e, "mes-emails");
  }
}
