// Liens cliquables dans le texte brut d'un mail (REA-408). Le corps des mails reçus est
// affiché en TEXTE (Graph, Prefer: outlook.body-content-type="text") : un lien y arrive soit
// nu (« https://… », « mailto:… »), soit sous la forme que Graph donne aux liens HTML,
// « libellé<https://…> ». On découpe le texte en morceaux texte / lien ; l'écran pose les
// liens. Pur, sans DOM. Seuls http(s) et mailto passent (lienSur) : jamais de javascript:.

import { lienSur } from "./mes-emails-html";

export type MorceauTexte = { type: "texte"; texte: string } | { type: "lien"; texte: string; href: string };

// 1 : la forme Graph « <url> » ; 2 : une adresse nue.
const LIEN = /<((?:https?:\/\/|mailto:)[^\s<>]+)>|((?:https?:\/\/|mailto:)[^\s<>"]+)/gi;
// Ponctuation collée à la fin d'une adresse nue qui n'en fait pas partie (« voir https://x.fr. »).
const FIN_PARASITE = /[.,;:!?'"»)\]]+$/;
// Le libellé de la forme Graph : le mot collé devant « <url> » (le texte du lien d'origine
// peut compter plusieurs mots, mais seul le dernier est sûr d'en faire partie).
const LIBELLE = /[^\s(["'«<>]+$/;

/** Libellé court d'une adresse sans libellé : l'adresse si elle est courte, sinon son domaine. */
export function libelleCourt(url: string): string {
  if (url.length <= 60) return url;
  if (/^mailto:/i.test(url)) return url.slice(7);
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return m ? `${m[1]}/…` : url;
}

/**
 * Retire les marqueurs d'images intégrées (« [cid:image001.png@01DB…] ») que Graph laisse
 * dans le texte à la place de chaque image. Presque toujours des logos de signature ; les
 * images utiles restent visibles en vignettes sous le mail (ImagesMail). Une ligne qui ne
 * portait que le marqueur disparaît avec lui.
 */
export function sansMarqueursImage(texte: string): string {
  if (!texte.includes("[cid:")) return texte;
  return texte
    .replace(/^[ \t]*\[cid:[^\]\n]{0,300}\][ \t]*\n/gim, "")
    .replace(/[ \t]*\[cid:[^\]\n]{0,300}\]/gi, "")
    .replace(/\n{3,}/g, "\n\n");
}

export function decouperLiens(texte: string): MorceauTexte[] {
  const morceaux: MorceauTexte[] = [];
  let tampon = "";
  let dernier = 0;
  const vider = () => {
    if (tampon) morceaux.push({ type: "texte", texte: tampon });
    tampon = "";
  };
  LIEN.lastIndex = 0;
  for (let m = LIEN.exec(texte); m; m = LIEN.exec(texte)) {
    tampon += texte.slice(dernier, m.index);
    dernier = m.index + m[0].length;
    if (m[1] !== undefined) {
      const url = m[1];
      if (!lienSur(url)) {
        tampon += m[0];
        continue;
      }
      // « https://x.fr<https://x.fr> » : l'adresse nue juste avant est déjà un lien.
      if (!tampon && morceaux.at(-1)?.type === "lien") continue;
      const libelle = LIBELLE.exec(tampon)?.[0] ?? "";
      tampon = tampon.slice(0, tampon.length - libelle.length);
      vider();
      morceaux.push({ type: "lien", texte: libelle || libelleCourt(url), href: url });
      continue;
    }
    let url = m[2]!;
    const parasite = FIN_PARASITE.exec(url)?.[0] ?? "";
    // Une parenthèse fermante fait partie de l'adresse si elle en ouvre une (wikipedia…).
    const garde = parasite.startsWith(")") && url.includes("(") ? 1 : 0;
    const coupe = parasite.length - garde;
    if (coupe > 0) {
      url = url.slice(0, url.length - coupe);
      dernier -= coupe;
    }
    if (!lienSur(url) || /^(https?:\/\/|mailto:)$/i.test(url)) {
      tampon += url;
      continue;
    }
    vider();
    morceaux.push({ type: "lien", texte: url, href: url });
  }
  tampon += texte.slice(dernier);
  vider();
  return morceaux;
}
