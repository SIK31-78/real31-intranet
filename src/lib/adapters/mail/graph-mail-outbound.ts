// Adapter Graph sortant : cree un brouillon de reponse dans la boite via
// createReply. On resout d'abord l'id Graph courant par internetMessageId (l'id
// peut avoir change si le mail a ete deplace), puis on cree la reponse avec le
// texte du cockpit en commentaire (Graph garde le fil + la citation). Pas de
// signature injectee (Signitic s'en charge cote Outlook).

import type { MailOutboundProvider } from "@/lib/ports/mail-outbound-provider";
import { GRAPH, jetonGraph, resoudreMessageId } from "./graph-auth";

function echapperHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

const dest = (adresses: string[]) =>
  adresses.filter((a) => a.includes("@")).map((a) => ({ emailAddress: { address: a.trim() } }));

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

  async envoyer(p: {
    boite: string;
    internetMessageId: string;
    corps: string;
    a: string[];
    cc: string[];
    cci: string[];
  }): Promise<void> {
    if (!p.boite) throw new Error("Envoi : boite manquante.");
    if (dest(p.a).length === 0) throw new Error("Envoi : au moins un destinataire en 'A'.");
    const tk = await jetonGraph();
    const u = `${GRAPH}/users/${encodeURIComponent(p.boite)}`;
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    const h = { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" };

    // 1. Brouillon de reponse (Graph garde le fil + la citation HTML).
    const r1 = await fetch(`${u}/messages/${id}/createReply`, { method: "POST", headers: h, body: "{}" });
    if (!r1.ok) throw new Error(`Graph createReply ${r1.status} : ${(await r1.text()).slice(0, 200)}`);
    const draft = (await r1.json()) as { id: string; body?: { content?: string } };

    // 2. Pose le corps (mon texte AU-DESSUS de la citation) + les destinataires choisis.
    const citation = draft.body?.content ?? "";
    const monTexte = `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${echapperHtml(p.corps)}</div>`;
    const r2 = await fetch(`${u}/messages/${draft.id}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({
        body: { contentType: "HTML", content: monTexte + citation },
        toRecipients: dest(p.a),
        ccRecipients: dest(p.cc),
        bccRecipients: dest(p.cci),
      }),
    });
    if (!r2.ok) throw new Error(`Graph PATCH brouillon ${r2.status} : ${(await r2.text()).slice(0, 200)}`);

    // 3. Envoi.
    const r3 = await fetch(`${u}/messages/${draft.id}/send`, { method: "POST", headers: h });
    if (!r3.ok) throw new Error(`Graph send ${r3.status} : ${(await r3.text()).slice(0, 200)}`);
  }
}
