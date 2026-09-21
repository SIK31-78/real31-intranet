// Le contrat en HTML A4 autonome (CSS inline, aucune dependance a l'app) : c'est ce que le
// service PDF donne a Chromium. Meme arbre que l'ecran (rendu-contrat), autre dessin.
// Toute valeur passe par `e()` : rien de ce qui vient d'une fiche ne devient du HTML.

import type { ChampsContrat } from "./champs-contrat";
import { arbreContrat, type NoeudContrat } from "./rendu-contrat";

const CSS = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Aptos, Calibri, Arial, Helvetica, sans-serif; font-size: 8.6pt; line-height: 1.3; color: #20251F; }
  header { margin-bottom: 8px; }
  header img { width: 100%; height: auto; margin-bottom: 10px; }
  h1 { font-size: 15pt; font-weight: 700; text-align: center; margin: 0 0 4px; letter-spacing: -0.01em; }
  header p { font-size: 7.4pt; color: #4C5347; text-align: justify; margin: 0 0 2px; white-space: pre-line; }
  .colonnes { display: flex; gap: 18px; align-items: flex-start; }
  .colonne { flex: 1 1 0; min-width: 0; }
  /* Un pixel de marge a droite : un bord de tableau ne doit jamais toucher la limite de page. */
  .colonne:last-child { padding-right: 2px; }
  /* Une seule colonne (contrat de mandat) : texte un peu plus grand, tableaux moins serres. */
  .colonnes.seule { font-size: 9.6pt; }
  .colonnes.seule table { font-size: 9.2pt; }
  .colonnes.seule h1, .colonnes.seule h2 { font-size: 9.8pt; }
  h2 { font-size: 8.6pt; font-weight: 600; margin: 9px 0 3px; padding: 3px 5px; background: #E3F1E7; color: #173626; white-space: pre-line; break-inside: avoid; break-after: avoid; }
  p { margin: 0 0 4px; text-align: justify; white-space: pre-line; }
  /* Bordures dessinees DANS la boite du tableau (separate + bord droit/bas par cellule) : en
     collapse, le trait exterieur deborde d'un demi-pixel et Chromium le coupe au bord de la
     page pour la colonne de droite (retour de Sekou, 17/09). */
  table { width: 100%; border-collapse: separate; border-spacing: 0; border-left: 1px solid #000; border-top: 1px solid #000; table-layout: fixed; margin: 4px 0 6px; font-size: 8.2pt; }
  th, td { border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 5px; vertical-align: top; text-align: left; white-space: pre-line; }
  .signatures { display: flex; gap: 24px; margin: 6px 0 14px; break-inside: avoid; break-before: avoid; }
  .signatures div { flex: 1 1 0; min-height: 60px; padding-top: 4px; font-weight: 600; }
  th { font-weight: 700; text-align: center; vertical-align: middle; }
  td.categorie { font-weight: 600; vertical-align: top; }
  td.montant { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  table.courte { break-inside: avoid; }
  tbody tr:first-child { break-before: avoid; }
  thead { break-after: avoid; }
  /* Aucune ligne ne se coupe entre deux pages, meme dans les annexes : un morceau de cellule
     sous un en-tete repete se lit mal (Sekou, 18/09). On prefere un blanc en bas de colonne. */
`;

export function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function noeud(n: NoeudContrat): string {
  if (n.type === "titre") return `<h2>${e(n.texte)}</h2>`;
  if (n.type === "signatures") return `<div class="signatures">${n.parties.map((p) => `<div>${e(p)}</div>`).join("")}</div>`;
  if (n.type === "paragraphe") return `<p>${e(n.texte)}</p>`;
  // Les colonnes du classeur, egales ; la derniere prend le reste (des pourcentages arrondis
  // depassaient d'un pixel, et Chromium coupait le bord droit dans la colonne de droite).
  const largeur = (100 / n.colonnes).toFixed(3);
  const colgroup = `<colgroup>${Array.from({ length: n.colonnes }, (_, i) => (i < n.colonnes - 1 ? `<col style="width:${largeur}%">` : "<col>")).join("")}</colgroup>`;
  const cellule = (c: (typeof n.lignes)[number]["cellules"][number], enTete: boolean) => {
    const span = `${c.etendue > 1 ? ` colspan="${c.etendue}"` : ""}${c.portee ? ` rowspan="${c.portee}"` : ""}`;
    if (enTete) return `<th${span}>${e(c.texte)}</th>`;
    const classe = c.portee ? ' class="categorie"' : c.montant ? ' class="montant"' : "";
    return `<td${span}${classe}>${e(c.texte)}</td>`;
  };
  const ligne = (l: (typeof n.lignes)[number]) => `<tr>${l.cellules.map((c) => cellule(c, l.enTete)).join("")}</tr>`;
  // L'en-tete en <thead> : Chromium le repete en haut de chaque page si le tableau se coupe.
  const thead = n.lignes[0]?.enTete ? `<thead>${ligne(n.lignes[0])}</thead>` : "";
  const corps = thead ? n.lignes.slice(1) : n.lignes;
  // Une grille courte ne se coupe jamais ; une longue peut, l'en-tete se repete alors.
  const classe = n.lignes.length <= 6 ? ' class="courte"' : "";
  return `<table${classe}>${colgroup}${thead}<tbody>${corps.map(ligne).join("")}</tbody></table>`;
}

/** Le document complet. `logoDataUri` : le bandeau d'en-tete en data: URI (le PDF n'a pas
 *  d'acces au site) ; `cssPolices` : les @font-face embarquees (Chromium sur Vercel n'a pas Aptos). */
export function htmlContrat(champs: ChampsContrat, logoDataUri?: string, cssPolices = ""): string {
  const a = arbreContrat(champs);
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${e(a.titre)}</title><style>${cssPolices}${CSS}</style></head>
<body>
<header>
  ${logoDataUri ? `<img src="${logoDataUri}" alt="REAL 31 Immobilier, FNAIM, 20 ans d'expertise immobilière">` : ""}
  <h1>${e(a.titre)}</h1>
  ${a.enTete.map((t) => `<p>${e(t)}</p>`).join("")}
</header>
<div class="colonnes${a.droite.length === 0 ? " seule" : ""}">
  <div class="colonne">${a.gauche.map(noeud).join("")}</div>
  ${a.droite.length > 0 ? `<div class="colonne">${a.droite.map(noeud).join("")}</div>` : ""}
</div>
</body></html>`;
}
