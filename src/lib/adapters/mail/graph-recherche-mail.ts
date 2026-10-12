// Adapter Graph (app-only) de l'écran « Échanges » : GET /users/{boîte}/messages?$search=
// sur TOUTE la boîte (réception, sous-dossiers, éléments envoyés). Graph rend les résultats
// d'une recherche du plus récent au plus ancien, par pages de 50. L'accès à une boîte est
// borné côté tenant par l'Application Access Policy : une boîte hors du groupe répond 403.

import { BoiteNonLisible, type EchangeTrouve } from "@/lib/domain/echanges";
import type { RechercheMailProvider } from "@/lib/ports/recherche-mail-provider";
import { GRAPH, graphFetch, jetonGraph } from "./graph-auth";

type Adresse = { emailAddress?: { address?: string; name?: string } };
type GraphMessage = {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject: string | null;
  from?: Adresse;
  toRecipients?: Adresse[];
  ccRecipients?: Adresse[];
  receivedDateTime: string;
  hasAttachments?: boolean;
  bodyPreview?: string;
  webLink?: string;
};

const SELECT =
  "id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,bodyPreview,webLink";
const adresses = (l?: Adresse[]) => (l ?? []).map((d) => d.emailAddress?.address ?? "").filter(Boolean);

export class GraphRechercheMail implements RechercheMailProvider {
  async rechercher(p: { boite: string; kql: string; max: number }): Promise<EchangeTrouve[]> {
    const tk = await jetonGraph();
    let url =
      `${GRAPH}/users/${encodeURIComponent(p.boite)}/messages` +
      `?$search=${encodeURIComponent(`"${p.kql}"`)}&$top=50&$select=${SELECT}`;
    const out: EchangeTrouve[] = [];
    while (url && out.length < p.max) {
      const r = await graphFetch(url, { headers: { Authorization: `Bearer ${tk}` } });
      if (r.status === 403 || r.status === 404) throw new BoiteNonLisible(p.boite);
      if (!r.ok) throw new Error(`Graph recherche ${r.status} : ${(await r.text()).slice(0, 200)}`);
      const j = (await r.json()) as { value?: GraphMessage[]; "@odata.nextLink"?: string };
      for (const m of j.value ?? []) {
        out.push({
          boite: p.boite,
          id: m.id,
          internetMessageId: m.internetMessageId ?? m.id,
          ...(m.conversationId ? { conversationId: m.conversationId } : {}),
          objet: m.subject || "(sans objet)",
          deNom: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "",
          deAdresse: (m.from?.emailAddress?.address ?? "").toLowerCase(),
          a: adresses(m.toRecipients),
          cc: adresses(m.ccRecipients),
          date: m.receivedDateTime,
          aPiecesJointes: Boolean(m.hasAttachments),
          apercu: m.bodyPreview ?? "",
          ...(m.webLink ? { lienOutlook: m.webLink } : {}),
        });
      }
      url = j["@odata.nextLink"] ?? "";
    }
    return out.slice(0, p.max);
  }

  async lireCorps(p: { boite: string; id: string }): Promise<string> {
    const tk = await jetonGraph();
    const r = await graphFetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${encodeURIComponent(p.id)}?$select=body`, {
      headers: { Authorization: `Bearer ${tk}`, Prefer: 'outlook.body-content-type="text"' },
    });
    if (r.status === 403) throw new BoiteNonLisible(p.boite);
    if (!r.ok) throw new Error(`Graph message ${r.status}`);
    return ((await r.json()) as { body?: { content?: string } }).body?.content ?? "";
  }
}
