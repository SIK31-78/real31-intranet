// Adapter Microsoft Graph (app-only / client credentials) d'ingestion de mail.
// Lit la boite indiquee (opts.email) via GET /users/{email}/mailFolders/inbox/messages.
// Le token est obtenu avec le secret de l'app (AUTH_MICROSOFT_ENTRA_ID_*) ; l'acces
// est borne cote tenant par une Application Access Policy (cf. docs/entra-app-registration.md).
// Plain fetch (pas de SDK Graph). Active par MAIL_SOURCE=graph.

import type { MailIngestionProvider, OptionsIngestion } from "@/lib/ports/mail-ingestion-provider";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";

const GRAPH = "https://graph.microsoft.com/v1.0";

function tenant(): string | null {
  const m = (process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER || "").match(
    /login\.microsoftonline\.com\/([^/]+)/,
  );
  return m?.[1] ?? null;
}

async function jeton(): Promise<string> {
  const t = tenant();
  const id = process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
  const secret = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
  if (!t || !id || !secret) {
    throw new Error("Identifiants Entra absents (AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER).");
  }
  const r = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!r.ok) throw new Error(`Token Graph ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("Token Graph : access_token absent.");
  return j.access_token;
}

type GraphMessage = {
  id: string;
  subject: string | null;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
  receivedDateTime: string;
  bodyPreview?: string;
  body?: { content?: string };
  hasAttachments?: boolean;
};

export class GraphMailIngestionProvider implements MailIngestionProvider {
  async lireRecents(opts: OptionsIngestion): Promise<RawMail[]> {
    const boite = opts.email;
    if (!boite) throw new Error("Ingestion Graph : adresse de la boite a lire manquante.");
    const tk = await jeton();
    const url =
      `${GRAPH}/users/${encodeURIComponent(boite)}/mailFolders/inbox/messages` +
      `?$top=${Math.min(opts.max, 50)}&$orderby=receivedDateTime desc` +
      `&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,body,hasAttachments`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${tk}`,
        // Corps en texte brut plutot qu'en HTML (plus propre pour le pipeline).
        Prefer: 'outlook.body-content-type="text"',
      },
    });
    if (!r.ok) throw new Error(`Graph messages ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { value?: GraphMessage[] };
    return (j.value ?? []).map((m): RawMail => ({
      id: m.id,
      from: m.from?.emailAddress?.address ?? m.from?.emailAddress?.name ?? "",
      to: (m.toRecipients ?? []).map((d) => d.emailAddress?.address ?? "").filter(Boolean),
      subject: m.subject ?? "",
      receivedAt: m.receivedDateTime,
      bodyText: m.body?.content ?? m.bodyPreview ?? "",
      copro: "",
      attachments: m.hasAttachments ? [{ name: "piece jointe" }] : [],
    }));
  }
}
