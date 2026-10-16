// Adapter Graph (app-only) de l'écran « Échanges » : GET /users/{boîte}/messages?$search=
// sur TOUTE la boîte (réception, sous-dossiers, éléments envoyés). Graph rend les résultats
// d'une recherche du plus récent au plus ancien, par pages de 50. L'accès à une boîte est
// borné côté tenant par l'Application Access Policy : une boîte hors du groupe répond 403.

import { BoiteNonLisible, sansCitation, type EchangeTrouve, type ReponseEnvoyee } from "@/lib/domain/echanges";
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

function versEchange(boite: string, m: GraphMessage): EchangeTrouve {
  return {
    boite,
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
  };
}

export class GraphRechercheMail implements RechercheMailProvider {
  async trouver(p: { boite: string; internetMessageId: string }): Promise<EchangeTrouve | null> {
    const tk = await jetonGraph();
    const filtre = encodeURIComponent(`internetMessageId eq '${p.internetMessageId.replace(/'/g, "''")}'`);
    const r = await graphFetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/messages?$filter=${filtre}&$top=1&$select=${SELECT}`, {
      headers: { Authorization: `Bearer ${tk}` },
    });
    if (r.status === 403 || r.status === 404) throw new BoiteNonLisible(p.boite);
    if (!r.ok) throw new Error(`Graph message ${r.status}`);
    const m = ((await r.json()) as { value?: GraphMessage[] }).value?.[0];
    return m ? versEchange(p.boite, m) : null;
  }

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
      for (const m of j.value ?? []) out.push(versEchange(p.boite, m));
      url = j["@odata.nextLink"] ?? "";
    }
    return out.slice(0, p.max);
  }

  async envoyes(p: { boite: string; max: number }): Promise<EchangeTrouve[]> {
    const tk = await jetonGraph();
    // Le dossier par son nom connu (sentitems), trié par date d'envoi : une seule page,
    // l'écran n'en montre que les derniers (REA-341, 16/10/2026).
    const top = Math.min(Math.max(Math.trunc(p.max), 1), 50);
    const r = await graphFetch(
      `${GRAPH}/users/${encodeURIComponent(p.boite)}/mailFolders/sentitems/messages` +
        `?$orderby=${encodeURIComponent("sentDateTime desc")}&$top=${top}&$select=${SELECT},sentDateTime`,
      { headers: { Authorization: `Bearer ${tk}` } },
    );
    if (r.status === 403 || r.status === 404) throw new BoiteNonLisible(p.boite);
    if (!r.ok) throw new Error(`Graph envoyés ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const l = ((await r.json()) as { value?: (GraphMessage & { sentDateTime?: string })[] }).value ?? [];
    return l.map((m) => ({ ...versEchange(p.boite, m), date: m.sentDateTime ?? m.receivedDateTime }));
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

  async envoyesDuFil(p: { boite: string; conversationId: string; apres: string; max: number }): Promise<ReponseEnvoyee[]> {
    const tk = await jetonGraph();
    // Filtre seul (Graph refuse souvent filtre + tri sur deux champs différents) : tri ici.
    const filtre = encodeURIComponent(`conversationId eq '${p.conversationId.replace(/'/g, "''")}'`);
    const r = await graphFetch(
      `${GRAPH}/users/${encodeURIComponent(p.boite)}/mailFolders/sentitems/messages?$filter=${filtre}&$top=25&$select=from,toRecipients,sentDateTime,body,webLink`,
      { headers: { Authorization: `Bearer ${tk}`, Prefer: 'outlook.body-content-type="text"' } },
    );
    if (r.status === 403 || r.status === 404) throw new BoiteNonLisible(p.boite);
    if (!r.ok) throw new Error(`Graph envoyés du fil ${r.status}`);
    const l = ((await r.json()) as { value?: (GraphMessage & { sentDateTime?: string; body?: { content?: string } })[] }).value ?? [];
    return l
      .filter((m) => (m.sentDateTime ?? "") > p.apres)
      .sort((a, b) => (a.sentDateTime ?? "").localeCompare(b.sentDateTime ?? ""))
      .slice(0, p.max)
      .map((m) => ({
        date: m.sentDateTime ?? "",
        deNom: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? p.boite,
        a: adresses(m.toRecipients),
        corps: sansCitation(m.body?.content ?? ""),
        ...(m.webLink ? { lienOutlook: m.webLink } : {}),
      }));
  }
}
