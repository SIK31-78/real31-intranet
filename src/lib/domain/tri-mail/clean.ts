// Nettoyage du corps et tri des pieces jointes (porte depuis assistant-ia).
// Fonctions pures.

import type { RawMail } from "./raw-mail";

// Images embarquees = signatures/logos/bannieres (95 % des PJ).
const SIGNATURE_IMAGE = /\.(png|jpe?g|gif|bmp|svg|webp)$/i;

/** PJ signifiantes : on retire les images, on garde pdf/doc/xls/zip... */
export function significantAttachments(mail: RawMail): RawMail["attachments"] {
  return mail.attachments.filter((a) => !SIGNATURE_IMAGE.test(a.name));
}

// Marqueurs de debut d'historique cite (FR + EN + Outlook).
const QUOTE_MARKERS: RegExp[] = [
  /^-{2,}\s*message d'origine\s*-{2,}/im,
  /^-{2,}\s*original message\s*-{2,}/im,
  /^_{5,}\s*$/m,
  /^\s*De\s*:.*(\n.*)?\n?\s*(Envoy[ée]|À|Objet)\s*:/im,
  /^\s*From\s*:.*(\n.*)?\n?\s*Sent\s*:/im,
  /^\s*Le\s.{0,80}?\sa\s*[ée]crit\s*:/im,
  /^\s*On\s.{0,80}?\swrote\s*:/im,
  /^\s*>\s.*/m,
];

/** Coupe l'historique cite : ne garde que le message du jour (avant le 1er marqueur). */
export function stripQuotedHistory(body: string): string {
  return body.slice(0, debutCitation(body)).trim();
}

/** Position du debut de l'historique cite (le 1er marqueur), ou la fin du texte. */
function debutCitation(body: string): number {
  let cut = body.length;
  for (const re of QUOTE_MARKERS) {
    const m = re.exec(body);
    if (m && m.index < cut) cut = m.index;
  }
  return cut;
}

// Sur un transfert, le contenu utile est le 1er message transfere : on coupe au
// 2e en-tete "De: / From:".
const FORWARD_SUBJECT = /^\s*(tr|fw|fwd)\s*:/i;
const DE_LINE = /^[ \t]*(De|From)[ \t]*:/gim;

function debutApresTransfert(body: string): number {
  return [...body.matchAll(DE_LINE)][1]?.index ?? body.length;
}

function trimForward(body: string): string {
  return body.slice(0, debutApresTransfert(body)).trim();
}

/**
 * Corps nettoye. Ordre important : normaliser les fins de ligne (les exports/
 * sources melent CRLF/CR/LF) AVANT de couper, puis reduire l'espace vertical.
 */
export function cleanBody(mail: RawMail): string {
  const normalise = (mail.bodyText ?? "").replace(/\r\n?/g, "\n");
  const body = FORWARD_SUBJECT.test(mail.subject ?? "")
    ? trimForward(normalise)
    : stripQuotedHistory(normalise);
  return aere(body);
}

/**
 * L'historique cite que cleanBody retire : les messages precedents de la conversation.
 * cleanBody sert au tri ; l'affichage doit pourtant montrer a quoi on repond (Mahaut,
 * 15/10/2026 : « on ne sait pas a quel mail elle recoit une reponse »). Borne a `max`
 * caracteres : un long fil ne doit pas alourdir la page.
 */
export function historiqueCite(mail: Pick<RawMail, "subject" | "bodyText">, max = 30_000): string {
  const normalise = (mail.bodyText ?? "").replace(/\r\n?/g, "\n");
  const debut = FORWARD_SUBJECT.test(mail.subject ?? "") ? debutApresTransfert(normalise) : debutCitation(normalise);
  const reste = aere(normalise.slice(debut));
  return reste.length > max ? `${reste.slice(0, max)}\n…` : reste;
}

function aere(texte: string): string {
  return texte
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SCAN_SUBJECT = /attached image|image jointe|num[ée]risation|scan(?!ner)/i;

/** Courrier papier scanne (objet generique + corps vide + PDF) -> file OCR. */
export function isAttachedImageScan(mail: RawMail): boolean {
  const hasPdf = mail.attachments.some((a) => /\.pdf$/i.test(a.name));
  return hasPdf && cleanBody(mail).length < 40 && SCAN_SUBJECT.test(mail.subject ?? "");
}
