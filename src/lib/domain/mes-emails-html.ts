// Mise en forme du texte d'un mail (REA-345, 16/10/2026, en pilote) : gras, italique,
// listes, liens. Pur, sans DOM : la même fonction nettoie dans le navigateur (au collage)
// et sur le serveur (avant l'envoi, où rien de ce que le navigateur envoie n'est cru).
//
// Liste blanche stricte : p, br, b/strong, i/em, u, ul, ol, li, a[href http(s) ou mailto],
// span[style color de la palette].
// Tout le reste perd sa balise et garde son texte (span, font, div de Word...), sauf les
// balises dont le CONTENU est dangereux ou invisible (script, style...), supprimées avec.
// Aucun attribut ne passe, hormis href sur un lien, revérifié après décodage des entités
// (un « &#106;avascript: » ne passe pas).
//
// Souligné et couleur du texte (02/11/2026, demande de Julie et Océane) : <u> passe, et une
// couleur passe sur un <span style="color:#…"> SEULEMENT si elle est l'une des couleurs de
// la palette de l'éditeur (COULEURS_TEXTE). Elle peut arriver en <font color> ou en
// <span style="color: rgb(…)"> selon le navigateur ; elle ressort toujours sous une seule
// forme, et aucun autre style ne passe. Une couleur hors palette (collage de Word, « couleur
// par défaut ») : la balise tombe, le texte reste.

const AUTORISEES = new Set(["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "a"]);

/** Les couleurs de texte proposées par l'éditeur (celles d'Office), les seules qui partent. */
export const COULEURS_TEXTE = [
  { nom: "Rouge", hex: "#c00000" },
  { nom: "Bleu", hex: "#0070c0" },
  { nom: "Vert", hex: "#00b050" },
  { nom: "Orange", hex: "#ed7d31" },
] as const;
const PALETTE = new Set<string>(COULEURS_TEXTE.map((c) => c.hex));
/** Balises qui portent une couleur ; elles ressortent en <span style="color:…">. */
const PORTE_COULEUR = new Set(["span", "font"]);
/** Une balise de couleur tombée (hors palette) : sa fermeture ne doit rien fermer d'autre. */
const FANTOME = "~span";
/** Un « div » de l'éditeur (Chrome en crée un par ligne) devient un paragraphe. */
const EN_PARAGRAPHE = new Set(["div"]);
/** Balises supprimées AVEC leur contenu. */
const SANS_CONTENU = new Set(["script", "style", "head", "title", "iframe", "object", "embed", "noscript", "template", "svg", "math", "xml", "textarea", "select"]);
const VIDES = new Set(["br"]);

const BALISE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)\b([^<>]*)>/g;

const NOMMEES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", colon: ":", tab: "\t", newline: "\n" };

/** Décode les entités HTML courantes (numériques et nommées usuelles). */
export function decoderEntites(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (brut, corps: string) => {
    const c = corps.toLowerCase();
    if (c.startsWith("#x")) return carSur(parseInt(c.slice(2), 16), brut);
    if (c.startsWith("#")) return carSur(parseInt(c.slice(1), 10), brut);
    return NOMMEES[c] ?? brut;
  });
}

function carSur(code: number, brut: string): string {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : brut;
}

const echapperTexte = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const echapperAttribut = (s: string) => echapperTexte(s).replace(/"/g, "&quot;");

/** Un texte entre balises, ré-échappé proprement (les entités existantes sont gardées). */
function texteSur(s: string): string {
  return echapperTexte(decoderEntites(s));
}

/** L'adresse d'un lien si elle est sûre (http, https, mailto), sinon null. */
export function lienSur(href: string): string | null {
  // Décodage, puis on retire espaces et caractères de contrôle que les navigateurs ignorent
  // dans un schéma (« java\tscript: »).
  const brut = decoderEntites(href).trim();
  const compact = brut.replace(/[\u0000- \u007f-\u009f]/g, "");
  if (!/^(https?:\/\/|mailto:)/i.test(compact)) return null;
  return brut;
}

/** Une couleur CSS (#rgb, #rrggbb, rgb(r, g, b)) ramenée à « #rrggbb » minuscule, sinon null. */
export function couleurNormalisee(valeur: string): string | null {
  const v = decoderEntites(valeur).trim().toLowerCase();
  const court = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (court) return `#${court[1]}${court[1]}${court[2]}${court[2]}${court[3]}${court[3]}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v);
  if (!rgb) return null;
  const parts = [rgb[1], rgb[2], rgb[3]].map(Number);
  if (parts.some((n) => n > 255)) return null;
  return `#${parts.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

const ATTRIBUT = {
  color: /(?:^|\s)color\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i,
  style: /(?:^|\s)style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i,
};

function valeurAttribut(attributs: string, nom: keyof typeof ATTRIBUT): string | null {
  const m = ATTRIBUT[nom].exec(attributs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

/** La couleur de la palette portée par un <span style> ou un <font color>, sinon null. */
function couleurDe(nom: string, attributs: string): string | null {
  let brute: string | null = null;
  if (nom === "font") brute = valeurAttribut(attributs, "color");
  else {
    const style = valeurAttribut(attributs, "style");
    // Seule la déclaration « color » est lue (pas background-color) ; le reste du style est ignoré.
    const m = style ? /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(decoderEntites(style)) : null;
    brute = m ? m[1] : null;
  }
  const hex = brute ? couleurNormalisee(brute) : null;
  return hex && PALETTE.has(hex) ? hex : null;
}

function hrefDe(attributs: string): string | null {
  const m = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attributs);
  const v = m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
  return v ? lienSur(v) : null;
}

/**
 * Le HTML du mail, réduit à la liste blanche, balises équilibrées. Ce qui sort peut être
 * posé tel quel dans le corps d'un mail ou dans l'éditeur.
 */
export function nettoyerHtmlMail(html: string): string {
  let out = "";
  const pile: string[] = [];
  let ignore: string | null = null; // dans un <script>... : on saute jusqu'à sa fermeture
  let dernier = 0;
  // Une balise fantôme (couleur tombée) se ferme sans rien écrire.
  const fermer = (b: string | undefined) => (b && b !== FANTOME ? `</${b}>` : "");
  BALISE.lastIndex = 0;
  for (let m = BALISE.exec(html); m; m = BALISE.exec(html)) {
    const avant = html.slice(dernier, m.index);
    dernier = m.index + m[0].length;
    if (!ignore) out += texteSur(avant);
    const nomBrut = m[2];
    if (!nomBrut) continue; // commentaire, doctype, CDATA : jamais recopiés
    const fermante = m[1] === "/";
    let nom = nomBrut.toLowerCase();
    if (ignore) {
      if (fermante && nom === ignore) ignore = null;
      continue;
    }
    if (SANS_CONTENU.has(nom)) {
      // Balise auto-fermée (<svg/>) : rien à sauter.
      if (!fermante && !/\/\s*$/.test(m[3] ?? "")) ignore = nom;
      continue;
    }
    if (nom === "strong") nom = "b";
    if (nom === "em") nom = "i";
    if (EN_PARAGRAPHE.has(nom)) nom = "p";
    if (PORTE_COULEUR.has(nom)) {
      if (fermante) {
        let i = pile.length - 1;
        while (i >= 0 && pile[i] !== "span" && pile[i] !== FANTOME) i--;
        if (i === -1) continue;
        while (pile.length > i) out += fermer(pile.pop());
        continue;
      }
      const couleur = couleurDe(nom, m[3] ?? "");
      if (couleur) out += `<span style="color:${couleur}">`;
      pile.push(couleur ? "span" : FANTOME);
      continue;
    }
    if (!AUTORISEES.has(nom)) continue;
    if (VIDES.has(nom)) {
      if (!fermante) out += "<br>";
      continue;
    }
    if (fermante) {
      const i = pile.lastIndexOf(nom);
      if (i === -1) continue; // fermeture orpheline : ignorée
      while (pile.length > i) out += fermer(pile.pop());
      continue;
    }
    if (nom === "a") {
      if (pile.includes("a")) continue; // pas de lien dans un lien
      const href = hrefDe(m[3] ?? "");
      // Lien refusé (javascript:, data:...) : son texte reste, sans lien ; sa fermeture,
      // orpheline, sera ignorée.
      if (!href) continue;
      out += `<a href="${echapperAttribut(href)}">`;
      pile.push("a");
      continue;
    }
    // Un paragraphe ne s'ouvre pas dans un paragraphe (div imbriqués de l'éditeur) : on ferme le précédent.
    if (nom === "p" && pile[pile.length - 1] === "p") out += fermer(pile.pop());
    out += `<${nom}>`;
    pile.push(nom);
  }
  if (!ignore) out += texteSur(html.slice(dernier));
  while (pile.length) out += fermer(pile.pop());
  return out;
}

/** Le texte équivalent (journal, brouillon enregistré, contrôle « message vide »). */
export function htmlVersTexte(html: string): string {
  const t = nettoyerHtmlMail(html)
    .replace(/<br>/g, "\n")
    .replace(/<li>/g, "\n- ")
    .replace(/<\/(p|ul|ol)>/g, "\n")
    .replace(/<p>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return decoderEntites(t)
    .replace(/ /g, " ")
    .replace(/^\n+/, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+$/, "");
}

/** Un texte brut (modèle de mail, brouillon IA) mis dans l'éditeur : échappé, sauts de ligne gardés. */
export function texteVersHtml(texte: string): string {
  return echapperTexte(texte).replace(/\r?\n/g, "<br>");
}

/**
 * Le corps prêt à partir : HTML nettoyé, police du cabinet (Aptos 11, comme les mails en
 * texte), paragraphes sans marge pour rendre ce que l'éditeur montrait.
 */
export function htmlMailMisEnForme(html: string): string {
  const propre = nettoyerHtmlMail(html).replace(/<p>/g, '<p style="margin:0">');
  return `<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt">${propre}</div>`;
}
