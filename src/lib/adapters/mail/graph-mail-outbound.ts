// Adapter Graph sortant : cree un brouillon de reponse dans la boite via
// createReply. On resout d'abord l'id Graph courant par internetMessageId (l'id
// peut avoir change si le mail a ete deplace), puis on cree la reponse avec le
// texte du cockpit en commentaire (Graph garde le fil + la citation). Pas de
// signature injectee (Signitic s'en charge cote Outlook).

import type { MailOutboundProvider } from "@/lib/ports/mail-outbound-provider";
import { GRAPH, jetonGraph, resoudreMessageId } from "./graph-auth";

export class GraphMailOutboundProvider implements MailOutboundProvider {
  async creerBrouillon(p: { boite: string; internetMessageId: string; corps: string }): Promise<void> {
    if (!p.boite) throw new Error("Creation brouillon : boite manquante.");
    const tk = await jetonGraph();
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    const r = await fetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${id}/createReply`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ comment: p.corps }),
    });
    if (!r.ok) throw new Error(`Graph createReply ${r.status} : ${(await r.text()).slice(0, 200)}`);
  }
}
