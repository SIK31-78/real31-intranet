// Adapter Microsoft Graph (app-only / client credentials) d'ingestion de mail.
// Lit la boite indiquee (opts.email) via GET /users/{email}/mailFolders/inbox/messages,
// avec pagination (@odata.nextLink) jusqu'a opts.max. Le token est obtenu avec le
// secret de l'app (AUTH_MICROSOFT_ENTRA_ID_*) ; l'acces est borne cote tenant par une
// Application Access Policy. Plain fetch (pas de SDK). Active par MAIL_SOURCE=graph.

import type { MailIngestionProvider, OptionsIngestion } from "@/lib/ports/mail-ingestion-provider";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import type { Correspondant } from "@/lib/domain/mes-emails";
import { GRAPH, graphFetch, jetonGraph } from "./graph-auth";

const PAGE = 50;

type AdresseGraph = { emailAddress?: { address?: string; name?: string } };

function correspondants(l: AdresseGraph[] | undefined): Correspondant[] {
  return (l ?? [])
    .map((d) => ({ adresse: d.emailAddress?.address ?? "", ...(d.emailAddress?.name ? { nom: d.emailAddress.name } : {}) }))
    .filter((c) => c.adresse);
}

/** Un message tel que Graph le rend (lecture de la reception, et son delta : graph-reception-delta.ts). */
export type GraphMessage = {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject: string | null;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: AdresseGraph[];
  ccRecipients?: AdresseGraph[];
  replyTo?: AdresseGraph[];
  receivedDateTime: string;
  bodyPreview?: string;
  body?: { content?: string };
  hasAttachments?: boolean;
  webLink?: string;
  singleValueExtendedProperties?: { id: string; value: string }[];
};

/** Le dernier geste d'Outlook (répondu, transféré) : propriété MAPI 0x1081, vérifiée le 13/10/2026. */
const EXPAND_VERBE = "$expand=" + encodeURIComponent("singleValueExtendedProperties($filter=id eq 'Integer 0x1081')");

/** Les champs lus d'un mail : partages avec la lecture incrementale (graph-reception-delta.ts). */
export const SELECT_MESSAGE =
  "id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,replyTo,receivedDateTime,bodyPreview,body,hasAttachments,webLink";

export function versRaw(m: GraphMessage): RawMail {
  return {
    id: m.id,
    internetMessageId: m.internetMessageId ?? m.id,
    ...(m.conversationId ? { conversationId: m.conversationId } : {}),
    from: m.from?.emailAddress?.address ?? m.from?.emailAddress?.name ?? "",
    ...(m.from?.emailAddress?.name ? { fromName: m.from.emailAddress.name } : {}),
    to: (m.toRecipients ?? []).map((d) => d.emailAddress?.address ?? "").filter(Boolean),
    toDetail: correspondants(m.toRecipients),
    ccDetail: correspondants(m.ccRecipients),
    replyTo: correspondants(m.replyTo),
    subject: m.subject ?? "",
    receivedAt: m.receivedDateTime,
    bodyText: m.body?.content ?? m.bodyPreview ?? "",
    copro: "",
    attachments: m.hasAttachments ? [{ name: "piece jointe" }] : [],
    ...(m.webLink ? { webLink: m.webLink } : {}),
    ...(m.singleValueExtendedProperties?.[0]?.value ? { dernierVerbe: Number(m.singleValueExtendedProperties[0].value) } : {}),
  };
}

export class GraphMailIngestionProvider implements MailIngestionProvider {
  async compterReception(email: string, depuis?: string): Promise<number> {
    const tk = await jetonGraph();
    const boite = `${GRAPH}/users/${encodeURIComponent(email)}/mailFolders/inbox`;
    if (depuis) {
      // Le stock d'avant la mise en service ne compte pas (18 233 mails dans syndic4).
      const r = await graphFetch(`${boite}/messages?$count=true&$top=1&$select=id&$filter=receivedDateTime ge ${depuis}`, {
        headers: { Authorization: `Bearer ${tk}`, ConsistencyLevel: "eventual" },
      });
      if (!r.ok) throw new Error(`Graph inbox ${r.status}`);
      return ((await r.json()) as { "@odata.count"?: number })["@odata.count"] ?? 0;
    }
    const r = await graphFetch(`${boite}?$select=totalItemCount`, { headers: { Authorization: `Bearer ${tk}` } });
    if (!r.ok) throw new Error(`Graph inbox ${r.status}`);
    return ((await r.json()) as { totalItemCount?: number }).totalItemCount ?? 0;
  }

  async lireRecents(opts: OptionsIngestion): Promise<RawMail[]> {
    const boite = opts.email;
    if (!boite) throw new Error("Ingestion Graph : adresse de la boite a lire manquante.");
    const tk = await jetonGraph();
    const select = SELECT_MESSAGE;
    // Dossier precis (sous-dossier du binome dans la boite partagee) ou boite de reception.
    const dossier = opts.folderId ? encodeURIComponent(opts.folderId) : "inbox";
    let url: string =
      `${GRAPH}/users/${encodeURIComponent(boite)}/mailFolders/${dossier}/messages` +
      `?$top=${Math.min(PAGE, opts.max)}&$orderby=receivedDateTime desc&$select=${select}&${EXPAND_VERBE}` +
      (opts.depuis ? `&$filter=receivedDateTime ge ${opts.depuis}` : "");

    const out: RawMail[] = [];
    while (url && out.length < opts.max) {
      const r = await graphFetch(url, {
        headers: {
          Authorization: `Bearer ${tk}`,
          // Corps en texte brut plutot qu'en HTML (plus propre pour le pipeline).
          Prefer: 'outlook.body-content-type="text"',
        },
      });
      if (!r.ok) throw new Error(`Graph messages ${r.status} : ${(await r.text()).slice(0, 200)}`);
      const j = (await r.json()) as { value?: GraphMessage[]; "@odata.nextLink"?: string };
      out.push(...(j.value ?? []).map(versRaw));
      url = j["@odata.nextLink"] ?? "";
    }
    return out.slice(0, opts.max);
  }

  async lireParIds(email: string, internetMessageIds: string[]): Promise<RawMail[]> {
    if (!email) throw new Error("Ingestion Graph : adresse de la boite a lire manquante.");
    const tk = await jetonGraph();
    const select = SELECT_MESSAGE;
    const ids = [...new Set(internetMessageIds.filter(Boolean))];
    // Par lots de 10 (filtre OR) : une URL raisonnable. Quatre lots a la fois (29/10/2026) : la
    // boite partagee lit maintenant tous ses mails a traiter (jusqu'a 200), plus seulement 80 ;
    // vingt allers-retours en serie auraient coute une dizaine de secondes.
    const lots: string[][] = [];
    for (let i = 0; i < ids.length; i += 10) lots.push(ids.slice(i, i + 10));
    const lireLot = async (lot: string[]): Promise<RawMail[]> => {
      const filtre = lot.map((id) => `internetMessageId eq '${id.replace(/'/g, "''")}'`).join(" or ");
      const r = await graphFetch(
        `${GRAPH}/users/${encodeURIComponent(email)}/messages?$filter=${encodeURIComponent(filtre)}&$select=${select}&${EXPAND_VERBE}&$top=50`,
        { headers: { Authorization: `Bearer ${tk}`, Prefer: 'outlook.body-content-type="text"' } },
      );
      if (!r.ok) throw new Error(`Graph messages par id ${r.status} : ${(await r.text()).slice(0, 200)}`);
      const j = (await r.json()) as { value?: GraphMessage[] };
      return (j.value ?? []).map(versRaw);
    };
    const out: RawMail[] = [];
    for (let i = 0; i < lots.length; i += 4) out.push(...(await Promise.all(lots.slice(i, i + 4).map(lireLot))).flat());
    // Un meme mail peut exister en double (copie dans Elements envoyes...) : un par id.
    const vus = new Set<string>();
    return out
      .filter((m) => (vus.has(m.internetMessageId) ? false : (vus.add(m.internetMessageId), true)))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }
}
