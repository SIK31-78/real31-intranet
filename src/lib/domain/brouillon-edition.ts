// Rouvrir un brouillon de la boîte perso dans l'éditeur riche (02/11/2026, décision Sekou,
// option a). Domaine pur : découper le corps HTML d'un brouillon lu dans Outlook en trois
// morceaux, et le recomposer après modification.
//
//   [avant]     le document jusqu'à <body…> inclus (les styles de <head> servent souvent à la
//               signature : on les garde tels quels) ;
//   [editable]  le texte écrit, la seule partie qui passe par l'éditeur (et donc par
//               nettoyerHtmlMail) ;
//   [suite]     ce qui ne doit pas passer par l'éditeur, gardé à l'octet près : la signature
//               posée par l'intranet, puis l'historique cité d'une réponse ;
//   [apres]     </body></html>.
//
// Signature : jamais ajoutée une deuxième fois. Retrouvée telle que l'intranet l'a posée
// (après normalisation des blancs et des <br/>), elle reste dans [suite] ; retrouvée seulement
// dans le texte (posée par Outlook, réécrite par Exchange), elle est « dans le texte » ;
// absente, elle est ajoutée à l'enregistrement, comme pour un mail neuf.
// 02/11/2026 (décision Sekou) : un brouillon dont la signature est « dans le texte » ne se
// rouvre plus dans l'éditeur (brouillonModifiable) : l'éditeur lui ferait perdre sa mise en
// page. On le finit dans Outlook ; l'écran remplace « Modifier » et le serveur refuse.

/** Une pièce jointe d'un brouillon (les pièces « en ligne », images de signature, sont écartées). */
export interface PieceBrouillon {
  id: string;
  nom: string;
  taille: number;
}

/** Un brouillon tel que lu dans la boîte, corps HTML brut compris. */
export interface BrouillonLu {
  objet: string;
  a: string[];
  cc: string[];
  cci: string[];
  html: string;
  pieces: PieceBrouillon[];
}

export type EtatSignature = "isolee" | "dans-le-texte" | "absente";

export interface CorpsDecoupe {
  avant: string;
  editable: string;
  suite: string;
  apres: string;
  signature: EtatSignature;
  /** Un historique de réponse (message cité) a été trouvé et sera gardé tel quel. */
  citation: boolean;
}

/** Ce que l'écran reçoit pour rouvrir le brouillon. */
export interface BrouillonEdition {
  boite: string;
  id: string;
  objet: string;
  a: string[];
  cc: string[];
  cci: string[];
  /** La partie écrite, déjà passée par nettoyerHtmlMail. */
  corpsHtml: string;
  signature: EtatSignature;
  /** La signature sera ajoutée à l'enregistrement (absente du brouillon, et connue). */
  signatureAjoutee: boolean;
  citation: boolean;
  pieces: PieceBrouillon[];
}

/**
 * Le brouillon peut-il passer par l'éditeur ? Non quand sa signature a été posée dans Outlook
 * (retrouvée seulement par son texte) : elle perdrait sa mise en page (02/11/2026, décision
 * Sekou). Signature de l'intranet (isolée) ou pas de signature : oui.
 */
export function brouillonModifiable(d: Pick<CorpsDecoupe, "signature">): boolean {
  return d.signature !== "dans-le-texte";
}

/** Les blancs entre balises et les variantes de <br> ne comptent pas pour retrouver la signature. */
function normaliser(html: string): string {
  return html
    .replace(/\r?\n/g, "")
    .replace(/>\s+</g, "><")
    .replace(/<br\s*\/?>/gi, "<br>")
    .trim();
}

/** Le texte visible, blancs compactés (comparaison « la signature est-elle là ? »). */
function texteCompact(html: string): string {
  return html
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Début de l'historique cité sous une réponse : Outlook (web et Graph createReply), Gmail, et
// toute citation en <blockquote>.
// 02/11/2026 : aussi Outlook bureau (Windows), dont l'en-tête du message cité est un <div> à
// trait supérieur (border-top:solid #E1E1E1 1.0pt, #B5C4DF sur les anciennes versions,
// guillemets simples ou doubles) suivi de « De : » / « From: », souvent dans un <div> nu qu'on
// emporte avec lui ; et le trait <hr> posé juste avant l'en-tête divRplyFwdMsg. L'historique
// reste ainsi tel quel, hors de l'éditeur. Le corps est déjà normalisé (pas de blanc entre
// balises).
const DEBUT_CITATION = new RegExp(
  [
    String.raw`<div[^>]*\bid="?(?:appendonsend|divRplyFwdMsg|mail-editor-reference-message-container)\b`,
    String.raw`<hr\b[^>]*>(?=<div[^>]*\bid="?divRplyFwdMsg\b)`,
    String.raw`(?:<div>)?<div[^>]*\bstyle=["'][^"']*border-top:\s*solid\s+#[0-9a-f]{3,6}\s+1(?:\.0)?pt[^"']*["'][^>]*>(?=(?:<[^>]+>)*(?:De|From)(?:\s|&nbsp;|&#160;)*:)`,
    String.raw`<div[^>]*\bclass="?[^">]*\bgmail_quote\b`,
    String.raw`<blockquote\b`,
  ].join("|"),
  "i",
);

/** Une signature trop courte se retrouverait n'importe où dans le texte : on ne la cherche pas. */
const SIGNATURE_MIN = 12;

export function decouperCorpsBrouillon(html: string, signatureHtml: string | null | undefined): CorpsDecoupe {
  const doc = normaliser(html);
  const ouvre = /<body\b[^>]*>/i.exec(doc);
  const debut = ouvre ? ouvre.index + ouvre[0].length : 0;
  const ferme = doc.toLowerCase().lastIndexOf("</body>");
  const fin = ferme >= debut ? ferme : doc.length;
  const avant = doc.slice(0, debut);
  const apres = doc.slice(fin);
  const corps = doc.slice(debut, fin);

  const sig = signatureHtml ? normaliser(signatureHtml) : "";
  const iSig = sig ? corps.indexOf(sig) : -1;
  const c = DEBUT_CITATION.exec(corps);
  const iCit = c ? c.index : -1;
  const coupures = [iSig, iCit].filter((i) => i >= 0);
  const coupe = coupures.length ? Math.min(...coupures) : corps.length;
  const editable = corps.slice(0, coupe);
  const suite = corps.slice(coupe);

  let signature: EtatSignature = "absente";
  if (iSig >= 0) signature = "isolee";
  else if (signatureHtml) {
    // Seulement dans la partie écrite : une signature citée dans l'historique (ma réponse
    // précédente) ne dit rien de celle du nouveau texte.
    const t = texteCompact(signatureHtml);
    if (t.length >= SIGNATURE_MIN && texteCompact(editable).includes(t)) signature = "dans-le-texte";
  }
  return { avant, editable, suite, apres, signature, citation: iCit >= 0 };
}

/**
 * Le corps à reposer sur le brouillon : le nouveau texte (déjà nettoyé et habillé par
 * l'appelant), la signature seulement si le brouillon n'en avait pas, puis la suite gardée.
 */
export function recomposerCorpsBrouillon(d: CorpsDecoupe, nouveauHtml: string, signatureHtml: string | null | undefined): string {
  const signature = d.signature === "absente" && signatureHtml ? `<br>${signatureHtml}` : "";
  return d.avant + nouveauHtml + signature + d.suite + d.apres;
}
