// Adapter Microsoft Graph (app-only / client credentials) d'ingestion de mail.
// Lit la boite indiquee (opts.email) via GET /users/{email}/mailFolders/inbox/messages,
// avec pagination (@odata.nextLink) jusqu'a opts.max. Le token est obtenu avec le
// secret de l'app (AUTH_MICROSOFT_ENTRA_ID_*) ; l'acces est borne cote tenant par une
// Application Access Policy. Plain fetch (pas de SDK). Active par MAIL_SOURCE=graph.

import type { MailIngestionProvider, OptionsIngestion } from "@/lib/ports/mail-ingestion-provider";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import { GRAPH, jetonGraph } from "./graph-auth";

const PAGE = 50;

type GraphMessage = {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject: string | null;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
  receivedDateTime: string;
  bodyPreview?: string;
  body?: { content?: string };
  hasAttachments?: boolean;
};

function versRaw(m: GraphMessage): RawMail {
  return {
    id: m.id,
    internetMessageId: m.internetMessageId ?? m.id,
    ...(m.conversationId ? { conversationId: m.conversationId } : {}),
    from: m.from?.emailAddress?.address ?? m.from?.emailAddress?.name ?? "",
    to: (m.toRecipients ?? []).map((d) => d.emailAddress?.address ?? "").filter(Boolean),
    subject: m.subject ?? "",
    receivedAt: m.receivedDateTime,
    bodyText: m.body?.content ?? m.bodyPreview ?? "",
    copro: "",
    attachments: m.hasAttachments ? [{ name: "piece jointe" }] : [],
  };
}

export class GraphMailIngestionProvider implements MailIngestionProvider {
  async lireRecents(opts: OptionsIngestion): Promise<RawMail[]> {
    const boite = opts.email;
    if (!boite) throw new Error("Ingestion Graph : adresse de la boite a lire manquante.");
    const tk = await jetonGraph();
    const select =
      "id,internetMessageId,conversationId,subject,from,toRecipients,receivedDateTime,bodyPreview,body,hasAttachments";
    let url: string =
      `${GRAPH}/users/${encodeURIComponent(boite)}/mailFolders/inbox/messages` +
      `?$top=${PAGE}&$orderby=receivedDateTime desc&$select=${select}`;

    const out: RawMail[] = [];
    while (url && out.length < opts.max) {
      const r = await fetch(url, {
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
}
