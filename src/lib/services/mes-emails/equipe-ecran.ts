// L'état d'équipe de l'écran E-mails au chargement (ADR-053, 29/10/2026) : attribution, notes,
// attente de chaque mail affiché, et les relances dues des mails envoyés (« Relance : pas de
// réponse depuis le … »). Une lecture par affichage (et par actualisation automatique).
//
// Aucun contrôle d'accès ici : les mails passés sont ceux que l'écran affiche déjà (boîtes
// visibles, distribués à mon binôme), les boîtes celles que la personne voit.
//
// Sans le SQL (tables absentes) : EQUIPE_INACTIVE, l'écran se comporte comme avant.

import type { MailEntrant } from "@/lib/domain/mes-emails";
import type { BoiteMail } from "@/lib/domain/boites-mail";
import { EQUIPE_INACTIVE, type EquipeEcran, type RecuDansFil, type RelanceAffichee } from "@/lib/domain/boite-equipe";
import { getMailIngestionProvider } from "@/lib/adapters/router";
import { etatEquipeDesMails, relancesDesBoites, type Lecteur } from "./boite-equipe";

/** Les messages reçus affichés, par fil : une réponse arrivée ramène un mail en attente (boîte perso). */
export function recusDesMails(mails: readonly Pick<MailEntrant, "id" | "conversationId" | "recuLe" | "date">[]): RecuDansFil[] {
  return mails.flatMap((m) => (m.conversationId ? [{ internetMessageId: m.id, conversationId: m.conversationId, recuLe: m.recuLe ?? m.date }] : []));
}

/** L'objet et les destinataires des envois à relancer, relus dans Outlook ; best-effort. */
async function decrire(dues: Omit<RelanceAffichee, "objet" | "a">[]): Promise<RelanceAffichee[]> {
  const ingestion = getMailIngestionProvider();
  const parBoite = new Map<string, string[]>();
  for (const r of dues) parBoite.set(r.boite, [...(parBoite.get(r.boite) ?? []), r.internetMessageId]);
  const lus = new Map<string, { objet: string; a: string[]; lienOutlook?: string }>();
  await Promise.all(
    [...parBoite].map(async ([boite, ids]) => {
      if (!ingestion.lireParIds) return;
      try {
        for (const m of await ingestion.lireParIds(boite, ids)) {
          lus.set(`${boite}|${m.internetMessageId}`, { objet: m.subject || "(sans objet)", a: m.to, ...(m.webLink ? { lienOutlook: m.webLink } : {}) });
        }
      } catch (err) {
        console.warn(`[boite-equipe] envois à relancer illisibles dans ${boite} :`, err instanceof Error ? err.message : String(err));
      }
    }),
  );
  return dues.map((r) => ({ ...r, ...(lus.get(`${r.boite}|${r.internetMessageId}`) ?? { objet: "(mail envoyé)", a: [] }) }));
}

/**
 * L'état d'équipe des mails affichés et les relances dues de ces boîtes. `actif` false si les
 * tables ne sont pas créées (ou en cas de panne : l'écran reste utilisable sans équipe).
 */
export async function equipeDeLEcran(
  lecteur: Lecteur,
  mails: readonly Pick<MailEntrant, "id" | "boite" | "conversationId" | "recuLe" | "date">[],
  boites: readonly Pick<BoiteMail, "id" | "personnelle">[],
): Promise<EquipeEcran> {
  const moi = (lecteur.email ?? "").trim().toLowerCase();
  if (!moi) return EQUIPE_INACTIVE;
  const recus = recusDesMails(mails);
  const perso = boites.find((b) => b.personnelle)?.id ?? "";
  try {
    const [etat, relances] = await Promise.all([
      etatEquipeDesMails(
        mails.map((m) => ({ internetMessageId: m.id, boite: m.boite ?? perso })),
        { lecteur, recus },
      ),
      relancesDesBoites(
        boites.map((b) => ({ id: b.id, personnelle: b.personnelle })),
        { lecteur, recus },
      ),
    ]);
    if (!etat.actif || relances === null) return EQUIPE_INACTIVE;
    const dues = relances
      .filter((r) => r.statut === "a-traiter" && r.jusquAu)
      .map((r) => ({
        internetMessageId: r.internetMessageId,
        boite: r.boite,
        conversationId: r.conversationId,
        envoyeLe: r.depuis,
        jusquAu: r.jusquAu!,
        parEmail: r.parEmail.trim().toLowerCase(),
        parInitiales: r.parInitiales,
      }));
    return { actif: true, moi, etats: [...etat.parMail.values()], relances: dues.length ? await decrire(dues) : [] };
  } catch (err) {
    console.warn("[boite-equipe] état d'équipe de l'écran illisible :", err instanceof Error ? err.message : String(err));
    return EQUIPE_INACTIVE;
  }
}
