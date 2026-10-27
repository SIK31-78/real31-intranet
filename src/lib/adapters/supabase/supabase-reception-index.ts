// Adapter Supabase de l'index de la reception (REA-419, 27/10/2026) : tables
// intranet_mail_reception (un mail par ligne, `sorti_le` pose quand il quitte la reception) et
// intranet_mail_delta (le jeton de la lecture incrementale Graph, par boite) ;
// supabase/sql/intranet_mail_reception.sql.
// Tables absentes (SQL pas encore passe) : IndexReceptionAbsent, les services retombent sur
// la lecture directe de la boite.

import { estMailInterne } from "@/lib/domain/tri-emails";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import { IndexReceptionAbsent, type EtatDelta, type ReceptionIndex } from "@/lib/ports/reception-index";
import { createSupabasePublicClient } from "./public-client";

const RECEPTION = "intranet_mail_reception";
const DELTA = "intranet_mail_delta";

/** Le corps garde pour la suggestion (« Immeuble concerné » est souvent loin dans l'historique cite). */
export const CORPS_MAX = 20_000;
const APERCU_MAX = 500;
/** Lignes ecrites par requete : jusqu'a 50 corps de 20 000 caracteres, une requete raisonnable. */
const LOT_ECRITURE = 50;
/** Ids Graph par requete `in` (~150 caracteres chacun) : borne l'URL. */
const LOT_IDS = 40;
/** PostgREST plafonne une reponse a 1 000 lignes : la file se lit par pages. */
const PAGE_LECTURE = 1000;

type Row = {
  boite: string;
  internet_message_id: string;
  message_id: string;
  conversation_id: string | null;
  expediteur_adresse: string;
  expediteur_nom: string | null;
  destinataires: string[] | null;
  objet: string;
  recu_le: string;
  apercu: string;
  corps: string;
  a_pieces_jointes: boolean;
  web_link: string | null;
};

const COLS =
  "boite, internet_message_id, message_id, conversation_id, expediteur_adresse, expediteur_nom, destinataires, objet, recu_le, apercu, corps, a_pieces_jointes, web_link";

type ErreurPg = { code?: string; message: string } | null;

function tableAbsente(error: ErreurPg): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function echec(quoi: string, error: NonNullable<ErreurPg>): Error {
  return tableAbsente(error) ? new IndexReceptionAbsent() : new Error(`Index de la réception (${quoi}) : ${error.message}`);
}

/** Postgres refuse le caractere nul dans un text ; un corps de mail en contient parfois. */
const sansNul = (s: string) => s.replace(/\u0000/g, "");

/** Texte brut nettoye : fins de ligne unifiees, plafonne. */
export function corpsPourIndex(texte: string): string {
  return sansNul(texte.replace(/\r\n/g, "\n").trim()).slice(0, CORPS_MAX);
}

function versLigne(boite: string, m: RawMail, maintenant: string): Row & { interne: boolean; maj_le: string; sorti_le: null } {
  const corps = corpsPourIndex(m.bodyText);
  return {
    boite,
    internet_message_id: m.internetMessageId,
    message_id: m.id,
    conversation_id: m.conversationId ?? null,
    expediteur_adresse: sansNul(m.from),
    expediteur_nom: m.fromName ? sansNul(m.fromName) : null,
    destinataires: m.to,
    objet: sansNul(m.subject),
    recu_le: m.receivedAt,
    apercu: corps.slice(0, APERCU_MAX),
    corps,
    a_pieces_jointes: m.attachments.length > 0,
    web_link: m.webLink ?? null,
    interne: estMailInterne(m.from, boite),
    maj_le: maintenant,
    sorti_le: null,
  };
}

function versMail(r: Row): RawMail {
  return {
    id: r.message_id,
    internetMessageId: r.internet_message_id,
    ...(r.conversation_id ? { conversationId: r.conversation_id } : {}),
    from: r.expediteur_adresse,
    ...(r.expediteur_nom ? { fromName: r.expediteur_nom } : {}),
    to: r.destinataires ?? [],
    subject: r.objet,
    receivedAt: r.recu_le,
    bodyText: r.corps || r.apercu,
    copro: "",
    // Le tri ne lit que la presence d'une piece jointe ; le detail se relit dans Graph a la demande.
    attachments: r.a_pieces_jointes ? [{ name: "piece jointe" }] : [],
    ...(r.web_link ? { webLink: r.web_link } : {}),
  };
}

function lotsDe<T>(valeurs: T[], taille: number): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < valeurs.length; i += taille) lots.push(valeurs.slice(i, i + taille));
  return lots;
}

export class SupabaseReceptionIndex implements ReceptionIndex {
  async appliquer(boite: string, delta: { ajoutes: RawMail[]; retires: string[] }): Promise<{ sortis: string[] }> {
    const client = createSupabasePublicClient();
    const t = new Date().toISOString();
    // Un meme mail peut revenir deux fois dans un delta (modifie puis deplace) : le dernier gagne.
    const parId = new Map(delta.ajoutes.map((m) => [m.internetMessageId, m]));
    for (const lot of lotsDe([...parId.values()], LOT_ECRITURE)) {
      // Sans indexe_le : l'insertion prend la date du jour, une mise a jour la garde.
      const { error } = await client.from(RECEPTION).upsert(lot.map((m) => versLigne(boite, m, t)), { onConflict: "boite,internet_message_id" });
      if (error) throw echec("ajouts", error);
    }
    const sortis: string[] = [];
    for (const lot of lotsDe([...new Set(delta.retires)], LOT_IDS)) {
      const { data, error } = await client
        .from(RECEPTION)
        .update({ sorti_le: t, maj_le: t })
        .eq("boite", boite)
        .in("message_id", lot)
        .is("sorti_le", null)
        .select("internet_message_id");
      if (error) throw echec("retraits", error);
      sortis.push(...((data ?? []) as { internet_message_id: string }[]).map((r) => r.internet_message_id));
    }
    return { sortis };
  }

  async enReception(boite: string, opts: { depuis?: string } = {}): Promise<RawMail[]> {
    const client = createSupabasePublicClient();
    const out: RawMail[] = [];
    for (let debut = 0; ; debut += PAGE_LECTURE) {
      let q = client.from(RECEPTION).select(COLS).eq("boite", boite).is("sorti_le", null);
      if (opts.depuis) q = q.gte("recu_le", opts.depuis);
      const { data, error } = await q
        .order("recu_le", { ascending: true })
        .order("internet_message_id", { ascending: true })
        .range(debut, debut + PAGE_LECTURE - 1);
      if (error) throw echec("lecture", error);
      const lignes = (data ?? []) as Row[];
      out.push(...lignes.map(versMail));
      if (lignes.length < PAGE_LECTURE) return out;
    }
  }

  async compter(boite: string, opts: { depuis?: string } = {}): Promise<number> {
    let q = createSupabasePublicClient().from(RECEPTION).select("internet_message_id", { count: "exact", head: true }).eq("boite", boite).is("sorti_le", null);
    if (opts.depuis) q = q.gte("recu_le", opts.depuis);
    const { count, error } = await q;
    if (error) throw echec("comptage", error);
    return count ?? 0;
  }

  async jetonDelta(boite: string): Promise<EtatDelta | null> {
    const { data, error } = await createSupabasePublicClient()
      .from(DELTA)
      .select("delta_token, maj_le, erreur, resynchro_le")
      .eq("boite", boite)
      .maybeSingle();
    if (error) throw echec("jeton", error);
    if (!data) return null;
    const r = data as { delta_token: string | null; maj_le: string; erreur: string | null; resynchro_le: string | null };
    return { jeton: r.delta_token, majLe: r.maj_le, erreur: r.erreur, resynchroLe: r.resynchro_le };
  }

  async enregistrerJetonDelta(boite: string, etat: { jeton: string | null; erreur?: string | null; resynchroLe?: string | null }): Promise<void> {
    const { error } = await createSupabasePublicClient()
      .from(DELTA)
      .upsert(
        {
          boite,
          delta_token: etat.jeton,
          maj_le: new Date().toISOString(),
          erreur: etat.erreur ? etat.erreur.slice(0, 500) : null,
          resynchro_le: etat.resynchroLe ?? null,
        },
        { onConflict: "boite" },
      );
    if (error) throw echec("jeton", error);
  }

  async sortir(boite: string, internetMessageIds: string[]): Promise<void> {
    const t = new Date().toISOString();
    for (const lot of lotsDe([...new Set(internetMessageIds)], LOT_IDS)) {
      const { error } = await createSupabasePublicClient()
        .from(RECEPTION)
        .update({ sorti_le: t, maj_le: t })
        .eq("boite", boite)
        .in("internet_message_id", lot)
        .is("sorti_le", null);
      if (error) throw echec("sortie", error);
    }
  }

  async remettre(boite: string, internetMessageId: string, messageId?: string): Promise<void> {
    const { error } = await createSupabasePublicClient()
      .from(RECEPTION)
      .update({ sorti_le: null, maj_le: new Date().toISOString(), ...(messageId ? { message_id: messageId } : {}) })
      .eq("boite", boite)
      .eq("internet_message_id", internetMessageId);
    if (error) throw echec("remise en réception", error);
  }

  async sortirNonRevus(boite: string, avantISO: string): Promise<number> {
    const t = new Date().toISOString();
    const { data, error } = await createSupabasePublicClient()
      .from(RECEPTION)
      .update({ sorti_le: t, maj_le: t })
      .eq("boite", boite)
      .is("sorti_le", null)
      .lt("maj_le", avantISO)
      .select("internet_message_id");
    if (error) throw echec("fin de relecture", error);
    return (data ?? []).length;
  }

  async purger(boite: string, sortisAvantISO: string): Promise<number> {
    const { data, error } = await createSupabasePublicClient()
      .from(RECEPTION)
      .delete()
      .eq("boite", boite)
      .lt("sorti_le", sortisAvantISO)
      .select("internet_message_id");
    if (error) throw echec("purge", error);
    return (data ?? []).length;
  }
}
