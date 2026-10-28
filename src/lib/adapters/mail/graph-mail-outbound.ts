// Adapter Graph sortant : cree un brouillon de reponse dans la boite via
// createReply. On resout d'abord l'id Graph courant par internetMessageId (l'id
// peut avoir change si le mail a ete deplace), puis on cree la reponse avec le
// texte du cockpit en commentaire (Graph garde le fil + la citation). Pas de
// signature injectee (Signitic s'en charge cote Outlook).

import type { MailOutboundProvider, PieceJointeMail, ReponseMail, TransfertMail } from "@/lib/ports/mail-outbound-provider";
import { TAILLE_ENVOI_SIMPLE, TRANCHE_UPLOAD, plageTranche } from "@/lib/domain/piece-jointe-flux";
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

// --- Pieces jointes d'un brouillon (REA-421, 27/10/2026) ---------------------------------
// Graph prend une piece de moins de 3 Mo en un POST (fileAttachment, base64). Au-dela, il
// exige une session d'upload : createUploadSession, puis des PUT par tranches (multiples de
// 320 Kio) avec Content-Range, jusqu'a la reponse 201. Avant, une piece de plus de 3 Mo
// faisait echouer toute la reponse.

/** Ouvre la session d'upload d'une piece sur le brouillon ; rend l'URL ou deposer les tranches. */
export async function ouvrirSession(
  tk: string,
  u: string,
  draftId: string,
  f: { nom: string; contentType: string; taille: number },
): Promise<string> {
  const r = await graphFetch(`${u}/messages/${encodeURIComponent(draftId)}/attachments/createUploadSession`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      AttachmentItem: { attachmentType: "file", name: f.nom, size: f.taille, contentType: f.contentType || "application/octet-stream" },
    }),
  });
  if (!r.ok) throw new Error(`Graph session d'upload ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { uploadUrl?: string };
  if (!j.uploadUrl) throw new Error("Graph session d'upload : uploadUrl absente.");
  return j.uploadUrl;
}

/**
 * Depose une tranche. L'URL de session porte sa propre autorisation : Graph refuse un
 * en-tete Authorization sur ce PUT. 200 = tranche recue, la suite est attendue ; 201 = la
 * piece est complete et jointe au brouillon.
 */
export async function deposerTranche(uploadUrl: string, debut: number, octets: Uint8Array, taille: number): Promise<{ fini: boolean }> {
  const r = await graphFetch(
    uploadUrl,
    {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "Content-Range": plageTranche(debut, octets.byteLength, taille) },
      body: octets as unknown as BodyInit,
    },
    60_000,
  );
  if (r.status === 201) return { fini: true };
  if (r.ok) return { fini: false };
  throw new Error(`Graph tranche ${r.status} : ${(await r.text()).slice(0, 200)}`);
}

/** Joint des octets au brouillon : POST simple sous 3 Mo, session d'upload au-dela. */
async function joindre(tk: string, u: string, draftId: string, f: { nom: string; contentType: string; octets: Uint8Array }): Promise<void> {
  const taille = f.octets.byteLength;
  if (taille < TAILLE_ENVOI_SIMPLE) {
    const r = await graphFetch(
      `${u}/messages/${encodeURIComponent(draftId)}/attachments`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: f.nom,
          contentType: f.contentType || "application/octet-stream",
          contentBytes: Buffer.from(f.octets.buffer, f.octets.byteOffset, taille).toString("base64"),
        }),
      },
      60_000,
    );
    if (!r.ok) throw new Error(`Graph ajout PJ ${r.status} : ${(await r.text()).slice(0, 200)}`);
    return;
  }
  const uploadUrl = await ouvrirSession(tk, u, draftId, { nom: f.nom, contentType: f.contentType, taille });
  for (let debut = 0; debut < taille; debut += TRANCHE_UPLOAD) {
    const { fini } = await deposerTranche(uploadUrl, debut, f.octets.subarray(debut, debut + TRANCHE_UPLOAD), taille);
    if (fini !== (debut + TRANCHE_UPLOAD >= taille)) throw new Error(`Graph session d'upload : reponse inattendue a l'octet ${debut}.`);
  }
}

/**
 * Le contenu d'une piece du mail d'origine, lu en octets bruts ($value) plutot qu'en base64
 * dans du JSON (un tiers de moins, pas de grosse chaine). Il est tenu en memoire le temps de
 * le joindre : la session d'upload veut la taille EXACTE, que Graph ne donne pas (la `size`
 * de la piece depasse le contenu de quelques centaines a 25 000 octets, et $value n'a pas de
 * Content-Length : mesure du 27/10/2026 sur syndic4). Une piece qui n'est pas un fichier (mail
 * joint, lien) rend null : elle n'est pas re-jointe, comme avant.
 */
async function lirePieceOrigine(tk: string, u: string, messageId: string, aid: string): Promise<{ nom: string; contentType: string; octets: Uint8Array } | null> {
  const base = `${u}/messages/${messageId}/attachments/${encodeURIComponent(aid)}`;
  const h = { Authorization: `Bearer ${tk}` };
  const rm = await graphFetch(`${base}?$select=name,contentType,size`, { headers: h });
  if (!rm.ok) throw new Error(`Graph lire PJ ${rm.status} : ${(await rm.text()).slice(0, 200)}`);
  const meta = (await rm.json()) as { "@odata.type"?: string; name?: string; contentType?: string };
  if (meta["@odata.type"] && meta["@odata.type"] !== "#microsoft.graph.fileAttachment") return null;
  const rv = await graphFetch(`${base}/$value`, { headers: h }, 60_000);
  if (!rv.ok) throw new Error(`Graph lire PJ ${rv.status} : ${(await rv.text()).slice(0, 200)}`);
  return { nom: meta.name ?? "piece-jointe", contentType: meta.contentType ?? "application/octet-stream", octets: new Uint8Array(await rv.arrayBuffer()) };
}

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
      // 1bis. Re-joint les PJ choisies du mail d'origine, une par une (au-dela de 3 Mo, par
      //      session d'upload : REA-421).
      for (const aid of p.pjIds ?? []) {
        const piece = await lirePieceOrigine(tk, u, id, aid);
        if (piece) await joindre(tk, u, draft.id, piece);
      }
      // 1ter. Fichiers ajoutes depuis l'ordinateur et passes dans la requete. L'ecran E-mails
      //       n'en passe plus : ses fichiers arrivent ensuite par la route de depot (REA-421).
      for (const f of p.piecesJointes ?? []) {
        await joindre(tk, u, draft.id, { nom: f.nom, contentType: f.contentType, octets: new Uint8Array(Buffer.from(f.base64, "base64")) });
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

  async preparerBrouillonReponse(p: ReponseMail): Promise<{ id: string; webLink?: string }> {
    const { draftId, webLink } = await this.preparerReponse(p);
    return { id: draftId, ...(webLink ? { webLink } : {}) };
  }

  async ajouterPieceJointe(p: { boite: string; draftId: string; nom: string; contentType: string; octets: Uint8Array }): Promise<void> {
    if (!p.boite || !p.draftId) throw new Error("Piece jointe : boite ou brouillon manquant.");
    const tk = await jetonGraph();
    await joindre(tk, `${GRAPH}/users/${encodeURIComponent(p.boite)}`, p.draftId, p);
  }

  async ouvrirSessionUpload(p: { boite: string; draftId: string; nom: string; contentType: string; taille: number }): Promise<{ uploadUrl: string }> {
    if (!p.boite || !p.draftId) throw new Error("Session d'upload : boite ou brouillon manquant.");
    const tk = await jetonGraph();
    return { uploadUrl: await ouvrirSession(tk, `${GRAPH}/users/${encodeURIComponent(p.boite)}`, p.draftId, p) };
  }

  async envoyerTranche(p: { uploadUrl: string; debut: number; octets: Uint8Array; taille: number }): Promise<{ fini: boolean }> {
    return deposerTranche(p.uploadUrl, p.debut, p.octets, p.taille);
  }

  async supprimerBrouillon(p: { boite: string; id: string }): Promise<void> {
    const tk = await jetonGraph();
    const r = await graphFetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${encodeURIComponent(p.id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tk}` },
    });
    // Deja supprime (404) : le but est atteint.
    if (!r.ok && r.status !== 404) throw new Error(`Graph suppression brouillon ${r.status} : ${(await r.text()).slice(0, 200)}`);
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
    citationHtml?: string;
  }): Promise<{ webLink?: string; internetMessageId?: string; id?: string }> {
    if (!p.boite) throw new Error("Creation brouillon neuf : boite manquante.");
    const tk = await jetonGraph();
    // Meme rendu HTML que envoyer() (police Aptos 11), signature dessous quand on la connait.
    // Corps mis en forme (REA-345) : deja nettoye et habille par l'appelant.
    const content =
      (p.corpsHtml ?? `<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt">${echapperHtml(p.corps)}</div>`) +
      (p.signatureHtml ? `<br/>${p.signatureHtml}` : "") +
      (p.citationHtml ?? "");
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
