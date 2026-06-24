// Adapter Graph sortant : cree un brouillon de reponse dans la boite via
// createReply. On resout d'abord l'id Graph courant par internetMessageId (l'id
// peut avoir change si le mail a ete deplace), puis on cree la reponse avec le
// texte du cockpit en commentaire (Graph garde le fil + la citation). Pas de
// signature injectee (Signitic s'en charge cote Outlook).

import type { MailOutboundProvider } from "@/lib/ports/mail-outbound-provider";
import { GRAPH, jetonGraph } from "./graph-auth";

async function resoudreId(tk: string, boite: string, internetMessageId: string): Promise<string> {
  // internetMessageId Graph est entoure de chevrons ; on echappe les quotes pour OData.
  const imid = internetMessageId.replace(/'/g, "''");
  const url =
    `${GRAPH}/users/${encodeURIComponent(boite)}/messages` +
    `?$filter=${encodeURIComponent(`internetMessageId eq '${imid}'`)}&$select=id&$top=1`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
  if (!r.ok) throw new Error(`Graph resoudre message ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { value?: { id: string }[] };
  const id = j.value?.[0]?.id;
  if (!id) throw new Error("Message introuvable dans la boite (deplace ou supprime ?).");
  return id;
}

export class GraphMailOutboundProvider implements MailOutboundProvider {
  async creerBrouillon(p: { boite: string; internetMessageId: string; corps: string }): Promise<void> {
    if (!p.boite) throw new Error("Creation brouillon : boite manquante.");
    const tk = await jetonGraph();
    const id = await resoudreId(tk, p.boite, p.internetMessageId);
    const r = await fetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${id}/createReply`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ comment: p.corps }),
    });
    if (!r.ok) throw new Error(`Graph createReply ${r.status} : ${(await r.text()).slice(0, 200)}`);
  }
}
