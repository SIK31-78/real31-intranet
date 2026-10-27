// Adapter Graph sortant : cree un brouillon de reponse dans la boite via
// createReply. On resout d'abord l'id Graph courant par internetMessageId (l'id
// peut avoir change si le mail a ete deplace), puis on cree la reponse avec le
// texte du cockpit en commentaire (Graph garde le fil + la citation). Pas de
// signature injectee (Signitic s'en charge cote Outlook).

import type { MailOutboundProvider, PieceJointeMail, ReponseMail, TransfertMail } from "@/lib/ports/mail-outbound-provider";
import { GRAPH, graphFetch, jetonGraph, resoudreMessageId } from "./graph-auth";

function echapperHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br/>");
}

const dest = (adresses: string[]) =>
  adresses.filter((a) => a.includes("@")).map((a) => ({ emailAddress: { address: a.trim() } }));

export class GraphMailOutboundProvider implements MailOutboundProvider {
  async creerBrouillon(p: { boite: string; internetMessageId: string; corps: string }): Promise<void> {
    if (!p.boite) throw new Error("Creation brouillon : boite manquante.");
    const tk = await jetonGraph();
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    const r = await graphFetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${id}/createReply`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ comment: p.corps }),
    });
    if (!r.ok) throw new Error(`Graph createReply ${r.status} : ${(await r.text()).slice(0, 200)}`);
  }

  /**
   * Transfert d'un mail choisi a la main dans l'ecran E-mails (REA-350). Meme chemin que
   * creerTransfert (createForward garde les pieces jointes d'origine), mais le corps est
   * pose comme pour une reponse : mon texte et ma signature AU-DESSUS du message transfere
   * (le commentaire de createForward est du texte brut, sans signature possible).
   */
  async transferer(p: TransfertMail): Promise<{ webLink?: string }> {
    if (!p.boite) throw new Error("Transfert : boite manquante.");
    if (dest(p.a).length === 0) throw new Error("Transfert : au moins un destinataire.");
    const tk = await jetonGraph();
    const u = `${GRAPH}/users/${encodeURIComponent(p.boite)}`;
    const h = { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" };
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    const r1 = await graphFetch(`${u}/messages/${id}/createForward`, { method: "POST", headers: h, body: "{}" });
    if (!r1.ok) throw new Error(`Graph createForward ${r1.status} : ${(await r1.text()).slice(0, 200)}`);
    const draft = (await r1.json()) as { id: string; webLink?: string; body?: { content?: string } };
    const transfere = draft.body?.content ?? "";
    const monTexte = p.corps.trim()
      ? `<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt">${echapperHtml(p.corps)}</div>`
      : "";
    const signature = p.signatureHtml ? `<br/>${p.signatureHtml}` : "";
    const r2 = await graphFetch(`${u}/messages/${encodeURIComponent(draft.id)}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({
        body: { contentType: "HTML", content: monTexte + signature + transfere },
        toRecipients: dest(p.a),
        ccRecipients: dest(p.cc),
      }),
    });
    if (!r2.ok) throw new Error(`Graph PATCH transfert ${r2.status} : ${(await r2.text()).slice(0, 200)}`);
    if (p.envoyer) {
      const r3 = await graphFetch(`${u}/messages/${encodeURIComponent(draft.id)}/send`, { method: "POST", headers: h });
      if (!r3.ok) throw new Error(`Graph send transfert ${r3.status} : ${(await r3.text()).slice(0, 200)}`);
      return {};
    }
    return draft.webLink ? { webLink: draft.webLink } : {};
  }

  async creerTransfert(p: {
    boite: string;
    internetMessageId: string;
    a: string[];
    sujet: string;
    commentaire: string;
  }): Promise<{ webLink?: string; internetMessageId?: string }> {
    if (!p.boite) throw new Error("Transfert : boite manquante.");
    if (dest(p.a).length === 0) throw new Error("Transfert : au moins un destinataire.");
    const tk = await jetonGraph();
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    // createForward cree le brouillon de transfert AVEC les pieces jointes d'origine.
    const r = await graphFetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${id}/createForward`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ toRecipients: dest(p.a), comment: p.commentaire }),
    });
    if (!r.ok) throw new Error(`Graph createForward ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const brouillon = (await r.json()) as { id: string; webLink?: string; internetMessageId?: string };
    // L'objet codifie remplace « TR: … » : c'est lui que lit la reception des factures.
    const maj = await graphFetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${encodeURIComponent(brouillon.id)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ subject: p.sujet }),
    });
    if (!maj.ok) throw new Error(`Graph objet du transfert ${maj.status} : ${(await maj.text()).slice(0, 200)}`);
    return {
      ...(brouillon.webLink ? { webLink: brouillon.webLink } : {}),
      ...(brouillon.internetMessageId ? { internetMessageId: brouillon.internetMessageId } : {}),
    };
  }

  /** Brouillon de reponse complet (fil, PJ, corps, objet, destinataires), pas envoye. */
  private async preparerReponse(p: ReponseMail): Promise<{ u: string; h: Record<string, string>; draftId: string; webLink?: string }> {
    if (!p.boite) throw new Error("Envoi : boite manquante.");
    if (dest(p.a).length === 0) throw new Error("Envoi : au moins un destinataire en 'A'.");
    const tk = await jetonGraph();
    const u = `${GRAPH}/users/${encodeURIComponent(p.boite)}`;
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    const h = { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" };

    // 1. Brouillon de reponse (Graph garde le fil + la citation HTML).
    const r1 = await graphFetch(`${u}/messages/${id}/createReply`, { method: "POST", headers: h, body: "{}" });
    if (!r1.ok) throw new Error(`Graph createReply ${r1.status} : ${(await r1.text()).slice(0, 200)}`);
    const draft = (await r1.json()) as { id: string; webLink?: string; body?: { content?: string } };

    // Une etape qui echoue apres createReply (PJ de plus de 3 Mo, PATCH refuse) laissait un
    // brouillon orphelin dans la boite, et le nouvel essai en creait un deuxieme (audit du
    // 27/10/2026) : on le supprime avant de remonter l'erreur.
    try {
      // 1bis. Re-joint les PJ choisies du mail d'origine (recuperees puis ajoutees au draft).
      for (const aid of p.pjIds ?? []) {
        // Timeout double sur la lecture/re-upload de PJ (plusieurs Mo en base64 possibles).
        const ra = await graphFetch(`${u}/messages/${id}/attachments/${encodeURIComponent(aid)}`, { headers: { Authorization: `Bearer ${tk}` } }, 60_000);
        if (!ra.ok) throw new Error(`Graph lire PJ ${ra.status} : ${(await ra.text()).slice(0, 200)}`);
        const att = (await ra.json()) as { name: string; contentType: string; contentBytes?: string };
        if (!att.contentBytes) continue;
        const rp = await graphFetch(`${u}/messages/${draft.id}/attachments`, {
          method: "POST",
          headers: h,
          body: JSON.stringify({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: att.name,
            contentType: att.contentType,
            contentBytes: att.contentBytes,
          }),
        }, 60_000);
        if (!rp.ok) throw new Error(`Graph ajout PJ ${rp.status} : ${(await rp.text()).slice(0, 200)}`);
      }
      // 1ter. Fichiers ajoutes depuis l'ordinateur.
      for (const f of p.piecesJointes ?? []) {
        const rf = await graphFetch(`${u}/messages/${draft.id}/attachments`, {
          method: "POST",
          headers: h,
          body: JSON.stringify({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: f.nom,
            contentType: f.contentType || "application/octet-stream",
            contentBytes: f.base64,
          }),
        }, 60_000);
        if (!rf.ok) throw new Error(`Graph ajout fichier ${rf.status} : ${(await rf.text()).slice(0, 200)}`);
      }

      // 2. Pose le corps (mon texte + signature AU-DESSUS de la citation), le sujet et les
      //    destinataires. Signature injectee ICI car Signitic (add-in Outlook) ne s'applique
      //    pas a un envoi app-only.
      const citation = draft.body?.content ?? "";
      // Corps mis en forme (REA-345) : deja nettoye et habille par l'appelant.
      const monTexte = p.corpsHtml ?? `<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt">${echapperHtml(p.corps)}</div>`;
      const signature = p.signatureHtml ? `<br/>${p.signatureHtml}` : "";
      const corpsPatch: Record<string, unknown> = {
        body: { contentType: "HTML", content: monTexte + signature + citation },
        toRecipients: dest(p.a),
        ccRecipients: dest(p.cc),
        bccRecipients: dest(p.cci),
      };
      if (p.sujet && p.sujet.trim()) corpsPatch.subject = p.sujet.trim();
      const r2 = await graphFetch(`${u}/messages/${draft.id}`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify(corpsPatch),
      });
      if (!r2.ok) throw new Error(`Graph PATCH brouillon ${r2.status} : ${(await r2.text()).slice(0, 200)}`);
    } catch (e) {
      await graphFetch(`${u}/messages/${encodeURIComponent(draft.id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${tk}` } }).catch(() => undefined);
      throw e;
    }

    return { u, h, draftId: draft.id, ...(draft.webLink ? { webLink: draft.webLink } : {}) };
  }

  async citationReponse(p: { boite: string; internetMessageId: string }): Promise<{ citationHtml: string; sujet: string }> {
    if (!p.boite) throw new Error("Citation : boite manquante.");
    const tk = await jetonGraph();
    const u = `${GRAPH}/users/${encodeURIComponent(p.boite)}`;
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    const h = { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" };
    // Le brouillon de reponse porte la citation exacte d'Outlook ; on ne le garde pas.
    const r = await graphFetch(`${u}/messages/${id}/createReply`, { method: "POST", headers: h, body: "{}" });
    if (!r.ok) throw new Error(`Graph createReply (citation) ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const draft = (await r.json()) as { id: string; subject?: string; body?: { content?: string } };
    const rd = await graphFetch(`${u}/messages/${draft.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${tk}` } });
    if (!rd.ok) {
      // Le mail part quand meme ; un brouillon reste dans la boite : on le signale.
      console.error(`[mail-outbound] brouillon de citation non supprime dans ${p.boite} (${rd.status})`);
    }
    return { citationHtml: draft.body?.content ?? "", sujet: draft.subject ?? "" };
  }

  async envoyer(p: ReponseMail): Promise<void> {
    const { u, h, draftId } = await this.preparerReponse(p);
    const r3 = await graphFetch(`${u}/messages/${draftId}/send`, { method: "POST", headers: h });
    if (!r3.ok) throw new Error(`Graph send ${r3.status} : ${(await r3.text()).slice(0, 200)}`);
  }

  async creerBrouillonReponse(p: ReponseMail): Promise<{ webLink?: string }> {
    const { webLink } = await this.preparerReponse(p);
    return webLink ? { webLink } : {};
  }

  async creerBrouillonNeuf(p: {
    boite: string;
    sujet: string;
    corps: string;
    a?: string[];
    cc?: string[];
    cci?: string[];
    signatureHtml?: string;
    corpsHtml?: string;
    piecesJointes?: PieceJointeMail[];
  }): Promise<{ webLink?: string; internetMessageId?: string }> {
    if (!p.boite) throw new Error("Creation brouillon neuf : boite manquante.");
    const tk = await jetonGraph();
    // Meme rendu HTML que envoyer() (police Aptos 11), signature dessous quand on la connait.
    // Corps mis en forme (REA-345) : deja nettoye et habille par l'appelant.
    const content =
      (p.corpsHtml ?? `<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt">${echapperHtml(p.corps)}</div>`) +
      (p.signatureHtml ? `<br/>${p.signatureHtml}` : "");
    // POST /messages cree un message en statut Draft (on n'envoie PAS).
    const r = await graphFetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: p.sujet,
        body: { contentType: "HTML", content },
        toRecipients: dest(p.a ?? []),
        ccRecipients: dest(p.cc ?? []),
        bccRecipients: dest(p.cci ?? []),
        // Pieces jointes dans le message meme (fileAttachment), comme envoyerNeuf : un
        // seul appel, le brouillon arrive complet dans Outlook. Permission : Mail.ReadWrite.
        ...(p.piecesJointes && p.piecesJointes.length > 0
          ? {
              attachments: p.piecesJointes.map((pj) => ({
                "@odata.type": "#microsoft.graph.fileAttachment",
                name: pj.nom,
                contentType: pj.contentType || "application/octet-stream",
                contentBytes: pj.base64,
              })),
            }
          : {}),
      }),
    }, p.piecesJointes?.length ? 60_000 : undefined);
    if (!r.ok) throw new Error(`Graph creer brouillon ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { id?: string; webLink?: string; internetMessageId?: string };
    return {
      ...(j.id ? { id: j.id } : {}),
      ...(j.webLink ? { webLink: j.webLink } : {}),
      ...(j.internetMessageId ? { internetMessageId: j.internetMessageId } : {}),
    };
  }

  async envoyerBrouillon(p: { boite: string; id: string }): Promise<void> {
    const tk = await jetonGraph();
    // POST /messages/{id}/send : le brouillon part tel quel (202, corps vide).
    const r = await graphFetch(
      `${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${encodeURIComponent(p.id)}/send`,
      { method: "POST", headers: { Authorization: `Bearer ${tk}` } },
    );
    if (!r.ok) throw new Error(`Graph envoyer brouillon ${r.status} : ${(await r.text()).slice(0, 200)}`);
  }

  async envoyerNeuf(p: {
    boite: string;
    a: string[];
    cc: string[];
    cci: string[];
    sujet: string;
    corps: string;
    corpsHtml?: string;
    signatureHtml?: string;
    piecesJointes?: PieceJointeMail[];
    citationHtml?: string;
  }): Promise<void> {
    if (!p.boite) throw new Error("Envoi : boite manquante.");
    if (dest(p.a).length === 0) throw new Error("Envoi : au moins un destinataire en 'A'.");
    const tk = await jetonGraph();

    // Corps : mon texte (Aptos 11pt) - ou l'HTML compose par l'appelant - puis la
    // signature Signitic dessous, injectee ICI car un envoi app-only ne passe pas par
    // l'add-in Outlook.
    const monTexte = p.corpsHtml ?? `<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt">${echapperHtml(p.corps)}</div>`;
    const signature = p.signatureHtml ? `<br/>${p.signatureHtml}` : "";
    const message = {
      subject: p.sujet,
      body: { contentType: "HTML", content: monTexte + signature + (p.citationHtml ?? "") },
      toRecipients: dest(p.a),
      ccRecipients: dest(p.cc),
      bccRecipients: dest(p.cci),
      // Pieces jointes en base64 dans le message meme (fileAttachment) : un contrat de
      // ~300 Ko, loin du plafond de 3 Mo de sendMail.
      ...(p.piecesJointes && p.piecesJointes.length > 0
        ? {
            attachments: p.piecesJointes.map((pj) => ({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: pj.nom,
              contentType: pj.contentType,
              contentBytes: pj.base64,
            })),
          }
        : {}),
    };

    // sendMail : Graph cree, envoie et archive dans "Elements envoyes" en un appel.
    const r = await graphFetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });
    if (!r.ok) throw new Error(`Graph sendMail ${r.status} : ${(await r.text()).slice(0, 200)}`);
  }
}
