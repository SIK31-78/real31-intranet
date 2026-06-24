// Adapter Graph (delegue) d'ingestion : lit la boite du gestionnaire connecte via
// Microsoft Graph (GET /me/messages). STUB pour l'instant : tant que la permission
// Mail.Read (Delegated) n'est pas accordee par le DSI, que le SSO ne capte pas
// l'access token, et que le SDK n'est pas installe, on echoue proprement.
//
// A brancher (cf. docs/entra-app-registration.md, etape 2bis) :
//   1. DSI : Mail.Read (Delegated) + offline_access + admin consent.
//   2. src/auth.ts : demander les scopes + capter access_token/refresh_token (JWT/session).
//   3. Installer @microsoft/microsoft-graph-client (+ @azure/identity si besoin).
//   4. Ici : client Graph avec le token de session -> GET /me/messages?$top=...&$select=...
//      -> mapper Message -> RawMail (id, from, to, subject, receivedDateTime, body.content, attachments).

import type { MailIngestionProvider, OptionsIngestion } from "@/lib/ports/mail-ingestion-provider";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";

export class GraphMailIngestionProvider implements MailIngestionProvider {
  lireRecents(opts: OptionsIngestion): Promise<RawMail[]> {
    void opts;
    return Promise.reject(
      new Error(
        "Ingestion Graph pas encore branchee : en attente de la permission Mail.Read (Delegated) " +
          "et de la capture du token SSO (cf. docs/entra-app-registration.md, etape 2bis).",
      ),
    );
  }
}
