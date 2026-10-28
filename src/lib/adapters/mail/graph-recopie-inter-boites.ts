// Adapter Graph de la recopie d'un mail d'une boîte partagée à une autre (ADR-050, 28/10/2026).
// App-only, borné par l'Access Policy aux boîtes du groupe REAL31-Intranet-MailRead. ÉCRIT
// dans la boîte cible : le service ne l'appelle que si l'écriture du tri est ouverte sur les
// deux boîtes et MAIL_SOURCE=graph.
//
// Graph ne déplace pas un message d'une boîte à l'autre. Création « depuis le MIME » écartée :
// POST /messages en text/plain (MIME en base64) crée un BROUILLON (isDraft=true, doc « Create
// message »), et on ne peut plus rien y changer après coup (les propriétés étendues ne sont
// modifiables que tant que isDraft=true : doc « Update message »). D'où la création en JSON,
// en posant à la création les propriétés MAPI qui en font un mail reçu :
//   - PR_MESSAGE_FLAGS (Integer 0x0E07) = 1 (MSGFLAG_READ seul, sans MSGFLAG_UNSENT 0x8) : pas
//     un brouillon. Doc MAPI « PidTagMessageFlags » : MSGFLAG_UNSENT n'est modifiable que jusqu'au
//     premier enregistrement, MSGFLAG_READ reste modifiable ensuite : on repasse donc le mail en
//     NON LU juste après (PATCH isRead=false), la seule écriture documentée du lu. Mesuré sur
//     syndic4 (lecture seule) : un mail reçu non lu porte 18 (0x12 = UNMODIFIED | HASATTACH,
//     deux drapeaux posés par la banque, en lecture seule pour un client).
//   - PR_MESSAGE_DELIVERY_TIME (SystemTime 0x0E06) = la date de réception d'origine : c'est elle
//     que Graph rend en `receivedDateTime` et qu'Outlook affiche et trie.
//   - PR_CLIENT_SUBMIT_TIME (SystemTime 0x0039) = la date d'envoi d'origine (`sentDateTime`).
//   - Le fil : `internetMessageId` d'origine (posé à la création, l'identifiant de référence du
//     tri), PR_IN_REPLY_TO_ID (String 0x1042), PR_INTERNET_REFERENCES (String 0x1039) et
//     PR_CONVERSATION_INDEX (Binary 0x0071, base64) : Exchange range la copie dans la même
//     conversation qu'un mail du fil déjà présent dans la cible. Valeurs relues sur syndic4.
//   - Une propriété nommée à nous (Real31RecopieDe = la boîte de départ) : distingue une copie
//     faite par l'intranet d'un mail reçu, pour ne jamais effacer un vrai mail.
// Pas recopiés, volontairement : les catégories (codes copro de l'AUTRE boîte), le suivi
// (drapeau), les accusés de lecture et de remise demandés (sinon ouvrir la copie dans la cible
// enverrait un accusé de lecture au correspondant au nom de la mauvaise boîte).
//
// Pièces jointes : lues en octets ($value), comme à l'envoi (REA-421). Celles qui tiennent sont
// jointes DANS la requête de création (documenté pour le JSON, requête de 4 Mo au plus) ; les
// autres sont ajoutées ensuite : POST simple sous 3 Mo, session d'upload au-delà (mêmes
// briques que graph-mail-outbound). Un mail joint (itemAttachment) devient un fichier .eml (son
// MIME, lu par $value) ; un lien (referenceAttachment) n'a pas de contenu à recopier : refus
// lisible, avant toute écriture. Un échec en route efface la copie partielle.

import { memesPieces, type PieceComparee } from "@/lib/domain/bascule-boites";
import { TAILLE_ENVOI_SIMPLE, TRANCHE_UPLOAD } from "@/lib/domain/piece-jointe-flux";
import type { RecopieInterBoitesProvider, SituationMail } from "@/lib/ports/recopie-inter-boites";
import { GRAPH, graphFetch, jetonGraph } from "./graph-auth";
import { deposerTranche, ouvrirSession } from "./graph-mail-outbound";

/** Les propriétés MAPI posées à la création de la copie (ids Graph « Type 0xTAG »). */
export const PROP = {
  drapeaux: "Integer 0x0E07",
  livraison: "SystemTime 0x0E06",
  soumission: "SystemTime 0x0039",
  enReponseA: "String 0x1042",
  references: "String 0x1039",
  indexConversation: "Binary 0x0071",
} as const;

/** Propriété nommée de l'intranet : la boîte d'où vient une copie. GUID propre à REAL31. */
export const PROP_RECOPIE = "String {6b3f0b7e-2c4e-4f8e-9b8a-3e1f2d7c5a10} Name Real31RecopieDe";

/** MSGFLAG_READ seul : pas MSGFLAG_UNSENT, donc pas un brouillon (le lu est retiré ensuite). */
export const DRAPEAUX_NON_BROUILLON = "1";

/** Budget de la requête de création (Graph refuse au-delà de 4 Mo) : marge pour l'en-tête. */
const BUDGET_CREATION = 3_400_000;

const u = (boite: string) => `${GRAPH}/users/${encodeURIComponent(boite)}`;

type Destinataire = { emailAddress?: { name?: string; address?: string } };
type ProprieteEtendue = { id: string; value: string };

/** Ce qu'on lit du mail d'origine. */
export interface MessageSource {
  subject?: string | null;
  body?: { contentType?: string; content?: string } | null;
  from?: Destinataire | null;
  sender?: Destinataire | null;
  toRecipients?: Destinataire[];
  ccRecipients?: Destinataire[];
  bccRecipients?: Destinataire[];
  replyTo?: Destinataire[];
  importance?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  internetMessageId?: string;
  conversationIndex?: string | null;
  singleValueExtendedProperties?: ProprieteEtendue[];
}

/** Une pièce prête à joindre. */
export interface PieceACopier {
  nom: string;
  contentType: string;
  isInline: boolean;
  contentId: string | null;
  octets: Uint8Array;
}

/** Graph rend les ids sous une autre forme qu'on les demande (« Binary 0x0071 » revient en « Binary 0x71 », relu sur syndic4) : on compare le type et la valeur du tag. */
function valeurEtendue(props: ProprieteEtendue[] | undefined, id: string): string | null {
  const [type, tag] = id.split(" ");
  const n = Number.parseInt(tag!.replace(/^0x/i, ""), 16);
  const p = (props ?? []).find((x) => {
    const [t, g] = x.id.split(" ");
    return t?.toLowerCase() === type!.toLowerCase() && Number.parseInt((g ?? "").replace(/^0x/i, ""), 16) === n;
  });
  return p?.value ?? null;
}

/** Le nom de la pièce dans la copie : un mail joint devient un fichier .eml. */
export function nomCopie(type: string | undefined, nom: string | undefined): string {
  const base = (nom ?? "").trim() || "piece-jointe";
  if (type === "#microsoft.graph.itemAttachment") return /\.eml$/i.test(base) ? base : `${base}.eml`;
  return base;
}

const enBase64 = (o: Uint8Array) => Buffer.from(o.buffer, o.byteOffset, o.byteLength).toString("base64");

function pieceJson(p: PieceACopier): Record<string, unknown> {
  return {
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: p.nom,
    contentType: p.contentType || "application/octet-stream",
    isInline: p.isInline,
    ...(p.contentId ? { contentId: p.contentId } : {}),
    contentBytes: enBase64(p.octets),
  };
}

/**
 * Le corps JSON de la création de la copie. Pur (testé). `jointes` : les pièces qui partent
 * dans la même requête (les autres sont ajoutées après).
 */
export function messageDeLaCopie(m: MessageSource, source: string, jointes: PieceACopier[] = []): Record<string, unknown> {
  const props: ProprieteEtendue[] = [
    { id: PROP.drapeaux, value: DRAPEAUX_NON_BROUILLON },
    { id: PROP_RECOPIE, value: source.trim().toLowerCase() },
  ];
  if (m.receivedDateTime) props.push({ id: PROP.livraison, value: m.receivedDateTime });
  if (m.sentDateTime) props.push({ id: PROP.soumission, value: m.sentDateTime });
  const enReponseA = valeurEtendue(m.singleValueExtendedProperties, PROP.enReponseA);
  if (enReponseA) props.push({ id: PROP.enReponseA, value: enReponseA });
  const references = valeurEtendue(m.singleValueExtendedProperties, PROP.references);
  if (references) props.push({ id: PROP.references, value: references });
  if (m.conversationIndex) props.push({ id: PROP.indexConversation, value: m.conversationIndex });

  const liste = (d: Destinataire[] | undefined) =>
    (d ?? []).filter((x) => x.emailAddress?.address).map((x) => ({ emailAddress: { name: x.emailAddress!.name ?? "", address: x.emailAddress!.address! } }));
  const un = (d: Destinataire | null | undefined) => liste(d ? [d] : [])[0];
  const from = un(m.from);
  const sender = un(m.sender) ?? from;

  return {
    subject: m.subject ?? "",
    body: { contentType: m.body?.contentType === "text" ? "text" : "html", content: m.body?.content ?? "" },
    ...(from ? { from } : {}),
    ...(sender ? { sender } : {}),
    toRecipients: liste(m.toRecipients),
    ccRecipients: liste(m.ccRecipients),
    bccRecipients: liste(m.bccRecipients),
    replyTo: liste(m.replyTo),
    importance: m.importance ?? "normal",
    ...(m.internetMessageId ? { internetMessageId: m.internetMessageId } : {}),
    // Jamais d'accusé demandé depuis la copie (voir l'en-tête).
    isDeliveryReceiptRequested: false,
    isReadReceiptRequested: false,
    singleValueExtendedProperties: props,
    ...(jointes.length ? { attachments: jointes.map(pieceJson) } : {}),
  };
}

/** Les pièces qui tiennent dans la requête de création, dans l'ordre ; les autres après. Pur. */
export function repartirPieces<T extends { octets: Uint8Array }>(pieces: T[], tailleCorps: number): { jointes: T[]; apres: T[] } {
  const jointes: T[] = [];
  const apres: T[] = [];
  let total = tailleCorps;
  for (const p of pieces) {
    // base64 : 4 octets pour 3, plus l'enveloppe JSON de la pièce.
    const poids = Math.ceil(p.octets.byteLength / 3) * 4 + 500;
    if (p.octets.byteLength < TAILLE_ENVOI_SIMPLE && total + poids <= BUDGET_CREATION) {
      jointes.push(p);
      total += poids;
    } else apres.push(p);
  }
  return { jointes, apres };
}

async function appel(url: string, init: RequestInit = {}, timeoutMs?: number): Promise<Response> {
  const tk = await jetonGraph();
  return graphFetch(url, { ...init, headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json", ...(init.headers ?? {}) } }, timeoutMs);
}

async function json<T>(r: Response, quoi: string): Promise<T> {
  if (!r.ok) throw new Error(`Graph ${quoi} ${r.status} : ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

let dossiersSysteme: Record<string, { reception: string; corbeille: string }> = {};

async function idsSysteme(boite: string): Promise<{ reception: string; corbeille: string }> {
  const connu = dossiersSysteme[boite];
  if (connu) return connu;
  const [r, c] = await Promise.all([
    json<{ id: string }>(await appel(`${u(boite)}/mailFolders/inbox?$select=id`), "inbox"),
    json<{ id: string }>(await appel(`${u(boite)}/mailFolders/deleteditems?$select=id`), "deleteditems"),
  ]);
  const ids = { reception: r.id, corbeille: c.id };
  dossiersSysteme = { ...dossiersSysteme, [boite]: ids };
  return ids;
}

type MetaPiece = { "@odata.type"?: string; id: string; name?: string; contentType?: string; size?: number; isInline?: boolean; contentId?: string | null };

async function listerPieces(boite: string, messageId: string): Promise<MetaPiece[]> {
  const sel = encodeURIComponent("id,name,contentType,size,isInline,microsoft.graph.fileAttachment/contentId");
  const j = await json<{ value: MetaPiece[] }>(
    await appel(`${u(boite)}/messages/${encodeURIComponent(messageId)}/attachments?$select=${sel}&$top=100`),
    "pieces jointes",
  );
  return j.value;
}

async function lireOctets(boite: string, messageId: string, p: MetaPiece): Promise<PieceACopier> {
  if (p["@odata.type"] === "#microsoft.graph.referenceAttachment") {
    throw new Error(`La pièce « ${p.name ?? "?"} » est un lien vers un fichier en ligne, pas un fichier : ce mail ne peut pas être recopié. Transférez-le depuis Outlook.`);
  }
  const r = await appel(`${u(boite)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(p.id)}/$value`, {}, 60_000);
  if (!r.ok) throw new Error(`Graph lire PJ ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const item = p["@odata.type"] === "#microsoft.graph.itemAttachment";
  return {
    nom: nomCopie(p["@odata.type"], p.name),
    contentType: item ? "message/rfc822" : p.contentType || "application/octet-stream",
    isInline: !item && Boolean(p.isInline),
    contentId: item ? null : (p.contentId ?? null),
    octets: new Uint8Array(await r.arrayBuffer()),
  };
}

/** Joint une pièce après la création : POST simple sous 3 Mo, session d'upload au-delà. */
async function joindreApres(cible: string, copieId: string, p: PieceACopier): Promise<void> {
  if (p.octets.byteLength < TAILLE_ENVOI_SIMPLE) {
    await json(
      await appel(`${u(cible)}/messages/${encodeURIComponent(copieId)}/attachments`, { method: "POST", body: JSON.stringify(pieceJson(p)) }, 60_000),
      "ajout PJ",
    );
    return;
  }
  const tk = await jetonGraph();
  const taille = p.octets.byteLength;
  const uploadUrl = await ouvrirSession(tk, u(cible), copieId, { nom: p.nom, contentType: p.contentType, taille });
  for (let debut = 0; debut < taille; debut += TRANCHE_UPLOAD) {
    const { fini } = await deposerTranche(uploadUrl, debut, p.octets.subarray(debut, debut + TRANCHE_UPLOAD), taille);
    if (fini !== (debut + TRANCHE_UPLOAD >= taille)) throw new Error(`Graph session d'upload : réponse inattendue à l'octet ${debut}.`);
  }
}

const SELECT_SOURCE = [
  "subject",
  "body",
  "from",
  "sender",
  "toRecipients",
  "ccRecipients",
  "bccRecipients",
  "replyTo",
  "importance",
  "receivedDateTime",
  "sentDateTime",
  "internetMessageId",
  "conversationIndex",
].join(",");

export class GraphRecopieInterBoites implements RecopieInterBoitesProvider {
  async situer(boite: string, internetMessageId: string): Promise<SituationMail | null> {
    const filtre = encodeURIComponent(`internetMessageId eq '${internetMessageId.replace(/'/g, "''")}'`);
    const expand = encodeURIComponent(`singleValueExtendedProperties($filter=id eq '${PROP_RECOPIE}')`);
    const j = await json<{
      value: {
        id: string;
        parentFolderId: string;
        subject?: string | null;
        conversationId?: string;
        from?: Destinataire;
        singleValueExtendedProperties?: ProprieteEtendue[];
      }[];
    }>(
      await appel(`${u(boite)}/messages?$filter=${filtre}&$select=id,parentFolderId,subject,from,conversationId&$expand=${expand}&$top=10`),
      "recherche message",
    );
    if (j.value.length === 0) return null;
    const { reception, corbeille } = await idsSysteme(boite);
    const situes = j.value.map((m) => ({
      m,
      lieu: m.parentFolderId === reception ? ("reception" as const) : m.parentFolderId === corbeille ? ("corbeille" as const) : ("autre" as const),
    }));
    // Hors corbeille d'abord ; la réception avant un autre dossier.
    const rang = { reception: 0, autre: 1, corbeille: 2 };
    situes.sort((a, b) => rang[a.lieu] - rang[b.lieu]);
    const { m, lieu } = situes[0]!;
    return {
      messageId: m.id,
      lieu,
      recopieDe: m.singleValueExtendedProperties?.find((p) => p.id.toLowerCase().includes("real31recopiede"))?.value ?? null,
      expediteur: m.from?.emailAddress?.address ?? "",
      objet: m.subject ?? "",
      ...(m.conversationId ? { conversationId: m.conversationId } : {}),
    };
  }

  async pieces(boite: string, messageId: string): Promise<PieceComparee[]> {
    return (await listerPieces(boite, messageId)).map((p) => ({ nom: nomCopie(p["@odata.type"], p.name), isInline: p["@odata.type"] !== "#microsoft.graph.itemAttachment" && Boolean(p.isInline) }));
  }

  async effacerCopie(boite: string, messageId: string): Promise<void> {
    const r = await appel(`${u(boite)}/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" });
    if (!r.ok && r.status !== 404) throw new Error(`Graph effacer copie ${r.status} : ${(await r.text()).slice(0, 200)}`);
  }

  async recopier(source: string, messageId: string, cible: string): Promise<{ messageId: string }> {
    const filtre = encodeURIComponent(`id eq '${PROP.enReponseA}' or id eq '${PROP.references}'`);
    const m = await json<MessageSource>(
      await appel(`${u(source)}/messages/${encodeURIComponent(messageId)}?$select=${SELECT_SOURCE}&$expand=singleValueExtendedProperties($filter=${filtre})`),
      "lecture du mail",
    );
    // Toutes les pièces sont lues AVANT d'écrire quoi que ce soit dans la cible : un lien
    // (referenceAttachment) ou une lecture en échec ne laisse rien derrière lui.
    const metas = await listerPieces(source, messageId);
    const pieces: PieceACopier[] = [];
    for (const p of metas) pieces.push(await lireOctets(source, messageId, p));

    const tailleCorps = JSON.stringify(messageDeLaCopie(m, source)).length;
    const { jointes, apres } = repartirPieces(pieces, tailleCorps);
    const cree = await json<{ id: string }>(
      await appel(`${u(cible)}/mailFolders/inbox/messages`, { method: "POST", body: JSON.stringify(messageDeLaCopie(m, source, jointes)) }, 60_000),
      "création de la copie",
    );
    try {
      for (const p of apres) await joindreApres(cible, cree.id, p);
      // MSGFLAG_READ, seul drapeau encore modifiable : la copie arrive NON LUE, comme un mail reçu.
      await json(await appel(`${u(cible)}/messages/${encodeURIComponent(cree.id)}`, { method: "PATCH", body: JSON.stringify({ isRead: false }) }), "non lu");
      // Contrôle final : la copie a toutes ses pièces (sinon elle ne vaut pas l'original).
      if (!memesPieces(await this.pieces(source, messageId), await this.pieces(cible, cree.id))) {
        throw new Error("La copie n'a pas toutes les pièces jointes de l'original.");
      }
    } catch (e) {
      await this.effacerCopie(cible, cree.id).catch((err: unknown) =>
        console.error("[bascule] copie partielle non effacée :", err instanceof Error ? err.message : err),
      );
      throw e;
    }
    return { messageId: cree.id };
  }
}
