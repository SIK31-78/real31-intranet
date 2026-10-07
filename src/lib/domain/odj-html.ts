// L'ODJ du CS rempli en HTML A4 autonome (CSS inline, aucune dependance a l'app) : c'est ce
// que le service PDF donne a Chromium. MEME arbre que l'ecran et que le Word (odj-rendu),
// autre dessin - le parti de l'ADR-012 v3.
//
// Toute valeur passe par `e()` : rien de ce qui a ete saisi en ligne ne devient du HTML.

import type { ArbreOdj, NoeudOdj, SectionRendue } from "./odj-rendu";

const CSS = `
  @page { size: A4; margin: 15mm 15mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Aptos, Calibri, Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.45; color: #20251F; }
  header.marque { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; padding-bottom: 8px; margin-bottom: 14px; border-bottom: 2px solid #1C4736; }
  header.marque img { height: 17mm; width: auto; }
  header.marque .titre { text-align: right; }
  header.marque .titre b { display: block; font-size: 12pt; }
  header.marque .titre span { font-size: 8.5pt; color: #4C5347; }
  h1 { font-size: 15pt; font-weight: 700; margin: 0; line-height: 1.2; }
  h1 .code { font-size: 11pt; font-weight: 400; color: #5C6355; }
  .adresse { font-size: 10pt; color: #4C5347; margin: 0 0 14px; }
  .reunion { background: #F5F6F3; border: 1px solid #DDE0DA; border-radius: 4px; padding: 8px 10px; margin-bottom: 16px; break-inside: avoid; }
  h2 { font-size: 11pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #1C4736; margin: 14px 0 6px; padding-bottom: 2px; border-bottom: 1px solid rgba(28,71,54,0.4); break-inside: avoid; break-after: avoid; }
  h2 .n { font-weight: 700; margin-right: 6px; font-variant-numeric: tabular-nums; }
  p { margin: 0 0 3px; }
  p.libre { margin: 0 0 6px; white-space: pre-line; break-inside: avoid; }
  .ligne { break-inside: avoid; }
  .ligne b { font-weight: 600; }
  .ligne .v { white-space: pre-line; }
  .ligne .blanc { display: inline-block; min-width: 45mm; border-bottom: 1px dotted #9AA294; }
  .bloc-para { margin: 0 0 7px; break-inside: avoid; }
  .bloc-para > p:first-child { font-weight: 600; margin-bottom: 1px; }
  .bloc-para > p:last-child { margin: 0 0 0 4mm; white-space: pre-line; }
  .point { margin: 0 0 7px; break-inside: avoid; }
  .point b { font-weight: 600; }
  .point .texte { font-size: 9.5pt; color: #4C5347; white-space: pre-line; margin: 0; }
  footer { margin-top: 18px; padding-top: 6px; border-top: 1px solid #DDE0DA; break-inside: avoid; }
  footer .fin b { font-weight: 600; }
  footer .mentions { margin-top: 8px; padding-top: 4px; border-top: 1px solid #DDE0DA; text-align: center; font-size: 6pt; line-height: 1.45; color: #4C5347; }
  footer .mentions p { margin: 0; }
`;

export function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Une valeur non renseignee garde le TRAIT de l'ecran : le lecteur la complete a la main. */
function valeur(v: string): string {
  return v ? `<span class="v">${e(v)}</span>` : '<span class="blanc"></span>';
}

function noeud(n: NoeudOdj): string {
  if (n.type === "paragraphe") return `<p class="libre">${e(n.texte)}</p>`;
  if (n.type === "point") return `<div class="point"><p><b>${e(n.titre)}</b></p><p class="texte">${e(n.texte)}</p></div>`;
  if (n.paragraphe) return `<div class="bloc-para"><p>${e(n.libelle)} :</p><p>${e(n.valeur)}</p></div>`;
  return `<p class="ligne"><b>${e(n.libelle)} :</b> ${valeur(n.valeur)}</p>`;
}

function section(s: SectionRendue): string {
  return `<section><h2><span class="n">${s.numero}.</span>${e(s.titre)}</h2>${s.noeuds.map(noeud).join("")}</section>`;
}

/** Le document complet. `logoDataUri` : le logo en data: URI (le PDF n'a pas d'acces au
 *  site) ; `cssPolices` : les @font-face embarquees (Chromium sur Vercel n'a pas Aptos). */
export function htmlOdj(a: ArbreOdj, logoDataUri?: string, cssPolices = ""): string {
  const titre = `${a.titre} - ${a.copro.nom}`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${e(titre)}</title><style>${cssPolices}${CSS}</style></head>
<body>
<header class="marque">
  ${logoDataUri ? `<img src="${logoDataUri}" alt="REAL 31 Immobilier">` : "<span></span>"}
  <div class="titre"><b>${e(a.titre)}</b><span>${e(a.sousTitre)}</span></div>
</header>
<h1>${e(a.copro.nom)} <span class="code">(${e(a.copro.code)})</span></h1>
<p class="adresse">${e(a.copro.adresse)}</p>
<div class="reunion">${a.reunion.map(noeud).join("")}</div>
${a.sections.map(section).join("")}
${a.blocsFin.map((t) => `<p class="libre">${e(t)}</p>`).join("")}
<footer>
  <p class="fin">Fin de réunion : ${a.finReunion ? `<b>${e(a.finReunion)}</b>` : '<span class="blanc"></span>'}</p>
  <div class="mentions">${a.mentions.map((m) => `<p>${e(m)}</p>`).join("")}</div>
</footer>
</body></html>`;
}
