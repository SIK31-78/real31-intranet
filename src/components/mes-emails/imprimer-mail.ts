// Impression d'un mail (remontee JB, 04/11/2026) : une page propre (en-tete, texte, liste des
// pieces jointes), sans la barre d'actions ni le reste de l'ecran. Le document est construit a
// part et imprime dans un iframe cache : pas de CSS @media print a maintenir sur le lecteur,
// et pas de fenetre a ouvrir (que les bloqueurs de popups refuseraient parfois).

import { libelleCorrespondant, type Correspondant, type MailEntrant, type PieceJointeRef } from "@/lib/domain/mes-emails";
import { formatDateLongue } from "@/lib/format-date";

function echapper(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function taille(octets: number): string {
  if (octets >= 1_000_000) return `${(octets / 1_000_000).toFixed(1)} Mo`;
  if (octets >= 1000) return `${Math.round(octets / 1000)} Ko`;
  return `${octets} o`;
}

/**
 * Document HTML imprimable du mail. `piecesJointes` : les pieces chargees (null = pas encore
 * lues ou indisponibles : on n'annonce alors que leur nombre).
 */
export function htmlImpressionMail(m: MailEntrant, piecesJointes: PieceJointeRef[] | null): string {
  const a: Correspondant[] = m.destinatairesDetail ?? m.destinataires.map((adresse) => ({ adresse }));
  const cc: Correspondant[] = m.copieDetail ?? m.copie.map((adresse) => ({ adresse }));
  const heure = m.recuLe
    ? new Date(m.recuLe).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
    : null;
  const lignes: [string, string][] = [
    ["De", libelleCorrespondant({ adresse: m.expediteurEmail, nom: m.de })],
    ["À", a.map(libelleCorrespondant).join(" ; ") || "-"],
    ...(cc.length ? ([["Cc", cc.map(libelleCorrespondant).join(" ; ")]] as [string, string][]) : []),
    ["Date", `${formatDateLongue(m.date)}${heure ? ` à ${heure}` : ""}`],
  ];
  const pj =
    m.attachments.length === 0
      ? ""
      : piecesJointes && piecesJointes.length > 0
        ? `<div class="pj"><strong>Pièces jointes (${piecesJointes.length})</strong><ul>${piecesJointes
            .map((p) => `<li>${echapper(p.nom)} <span class="t">(${taille(p.taille)})</span></li>`)
            .join("")}</ul></div>`
        : `<div class="pj"><strong>Pièces jointes</strong> : ${m.attachments.length}</div>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(m.objet)}</title><style>
@page { margin: 18mm; }
body { font: 12pt/1.5 Arial, Helvetica, sans-serif; color: #111; margin: 0; }
h1 { font-size: 16pt; margin: 0 0 10pt; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 2pt 12pt; margin: 0 0 12pt; padding-bottom: 10pt; border-bottom: 1px solid #999; font-size: 10.5pt; }
dt { color: #555; } dd { margin: 0; overflow-wrap: anywhere; }
.corps { white-space: pre-wrap; overflow-wrap: anywhere; }
.pj { margin-top: 16pt; padding-top: 10pt; border-top: 1px solid #999; font-size: 10.5pt; }
.pj ul { margin: 4pt 0 0; padding-left: 16pt; } .t { color: #555; }
</style></head><body><h1>${echapper(m.objet)}</h1><dl>${lignes
    .map(([k, v]) => `<dt>${k}</dt><dd>${echapper(v)}</dd>`)
    .join("")}</dl><div class="corps">${echapper(m.corps)}</div>${pj}</body></html>`;
}

/** Ouvre la boite d'impression du navigateur sur le mail (cote client uniquement). */
export function imprimerMail(m: MailEntrant, piecesJointes: PieceJointeRef[] | null): void {
  const cadre = document.createElement("iframe");
  cadre.setAttribute("aria-hidden", "true");
  cadre.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  cadre.srcdoc = htmlImpressionMail(m, piecesJointes);
  cadre.onload = () => {
    const fenetre = cadre.contentWindow;
    if (!fenetre) return cadre.remove();
    fenetre.focus();
    fenetre.print();
    // Laisse a la boite d'impression le temps de lire le document avant de le retirer.
    setTimeout(() => cadre.remove(), 60_000);
  };
  document.body.appendChild(cadre);
}
