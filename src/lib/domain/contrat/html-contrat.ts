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
  header img { height: 44px; margin-bottom: 8px; }
  h1 { font-size: 15pt; font-weight: 700; text-align: center; margin: 0 0 4px; letter-spacing: -0.01em; }
  header p { font-size: 7.4pt; color: #4C5347; text-align: justify; margin: 0 0 2px; white-space: pre-line; }
  .colonnes { display: flex; gap: 18px; align-items: flex-start; }
  .colonne { flex: 1 1 0; min-width: 0; }
  h2 { font-size: 8.6pt; font-weight: 600; margin: 9px 0 3px; padding: 3px 5px; background: #E3F1E7; color: #173626; white-space: pre-line; break-inside: avoid; break-after: avoid; }
  p { margin: 0 0 4px; text-align: justify; white-space: pre-line; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 4px 0 6px; font-size: 8.2pt; }
  th, td { border: 1px solid #000; padding: 3px 5px; vertical-align: top; text-align: left; white-space: pre-line; }
  th { font-weight: 700; text-align: center; vertical-align: middle; }
  td.categorie { font-weight: 600; vertical-align: top; }
  td.montant { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  table.courte { break-inside: avoid; }
  tbody tr:first-child { break-before: avoid; }
`;

export function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function noeud(n: NoeudContrat): string {
  if (n.type === "titre") return `<h2>${e(n.texte)}</h2>`;
  if (n.type === "paragraphe") return `<p>${e(n.texte)}</p>`;
  const colgroup = n.colonnes === 2 ? `<colgroup><col style="width:58%"><col style="width:42%"></colgroup>` : "";
  const enTetes = n.lignes.filter((l) => l.enTete);
  const corps = n.lignes.filter((l) => !l.enTete);
  const cellule = (c: (typeof n.lignes)[number]["cellules"][number], enTete: boolean) => {
    if (c.fusionnee) return "";
    if (enTete) return `<th>${e(c.texte)}</th>`;
    const attrs = `${c.portee ? ` rowspan="${c.portee}" class="categorie"` : c.montant ? ' class="montant"' : ""}`;
    return `<td${attrs}>${e(c.texte)}</td>`;
  };
  const ligne = (l: (typeof n.lignes)[number]) => `<tr>${l.cellules.map((c) => cellule(c, l.enTete)).join("")}</tr>`;
  // Les en-tetes en <thead> : Chromium les repete en haut de chaque page si le tableau se coupe.
  const thead = enTetes.length > 0 && n.lignes[0]?.enTete ? `<thead>${ligne(enTetes[0]!)}</thead>` : "";
  const reste = thead ? n.lignes.slice(1) : corps;
  // Une grille courte ne se coupe jamais ; une longue peut, l'en-tete se repete alors.
  const classe = n.lignes.length <= 6 ? ' class="courte"' : "";
  return `<table${classe}>${colgroup}${thead}<tbody>${reste.map(ligne).join("")}</tbody></table>`;
}

/** Le document complet. `logoDataUri` : le logo en data: URI (le PDF n'a pas d'acces au site). */
export function htmlContrat(champs: ChampsContrat, logoDataUri?: string): string {
  const a = arbreContrat(champs);
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${e(a.titre)}</title><style>${CSS}</style></head>
<body>
<header>
  ${logoDataUri ? `<img src="${logoDataUri}" alt="REAL 31 Immobilier">` : ""}
  <h1>${e(a.titre)}</h1>
  ${a.enTete.map((t) => `<p>${e(t)}</p>`).join("")}
</header>
<div class="colonnes">
  <div class="colonne">${a.gauche.map(noeud).join("")}</div>
  <div class="colonne">${a.droite.map(noeud).join("")}</div>
</div>
</body></html>`;
}
