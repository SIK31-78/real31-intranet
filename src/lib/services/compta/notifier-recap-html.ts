// Le mail de recap AG en HTML : un tableau lisible dans Outlook, aux couleurs de
// l'intranet (papier #E8E4DA, encre #20251F, vert REAL31 #1C4736, filets #DBD6C9).
// Styles INLINE et tableaux : c'est ce que les clients mail rendent, pas les classes.
// Toutes les valeurs passent par `e()` : rien de ce que les gestionnaires saisissent
// ne devient du HTML.

import type { RecapANotifier } from "./notifier-recap";
import { formatEuros, formatHeure, formatJour } from "@/lib/services/facturation/format";

const C = {
  papier: "#E8E4DA",
  carte: "#FFFFFF",
  filet: "#DBD6C9",
  encre: "#20251F",
  encre2: "#4C5347",
  encre3: "#5C6355",
  vert: "#1C4736",
  vert600: "#27614A",
  vert50: "#E3F1E7",
  ok: "#1F6B47",
  warn: "#7A5200",
  warn50: "#F7EFD9",
};
const POLICE = "font-family:Aptos,Calibri,Arial,sans-serif;";

function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const euros = (v: number | undefined) => (v === undefined ? "—" : formatEuros(v));
const pourcent = (v: number | undefined) => (v === undefined ? "—" : `${v.toLocaleString("fr-FR")} %`);
const texte = (v: string | undefined) => (v && v.trim() ? e(v) : `<span style="color:${C.encre3}">—</span>`);

function pastille(v: boolean | undefined): string {
  if (v === undefined) return `<span style="color:${C.encre3}">—</span>`;
  const fond = v ? C.vert50 : C.papier;
  const encre = v ? C.ok : C.encre2;
  return `<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:${fond};color:${encre};font-size:10pt;font-weight:600">${v ? "Oui" : "Non"}</span>`;
}

function ligne(libelle: string, valeur: string, fort = false): string {
  return `<tr>
    <td style="padding:7px 12px;border-bottom:1px solid ${C.filet};color:${C.encre2};font-size:10.5pt;width:52%;vertical-align:top">${e(libelle)}</td>
    <td style="padding:7px 12px;border-bottom:1px solid ${C.filet};color:${C.encre};font-size:10.5pt;vertical-align:top;${fort ? "font-weight:600" : ""}">${valeur}</td>
  </tr>`;
}

function section(titre: string, corps: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:${C.carte};border:1px solid ${C.filet};border-radius:8px;margin-top:14px">
    <tr><td style="padding:8px 12px;border-bottom:1px solid ${C.filet};color:${C.vert};font-size:10pt;font-weight:700;letter-spacing:.04em;text-transform:uppercase">${e(titre)}</td></tr>
    <tr><td style="padding:0"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">${corps}</table></td></tr>
  </table>`;
}

function tableauTravaux(r: RecapANotifier): string {
  if (r.travaux.length === 0) return "";
  const th = (t: string, align = "left") => `<th style="padding:7px 10px;background:${C.vert50};color:${C.vert};font-size:9.5pt;text-align:${align};border-bottom:1px solid ${C.filet}">${e(t)}</th>`;
  const td = (v: string, align = "left") => `<td style="padding:7px 10px;border-bottom:1px solid ${C.filet};font-size:10.5pt;color:${C.encre};text-align:${align};vertical-align:top">${v}</td>`;
  const lignes = r.travaux
    .map(
      (t) => `<tr>${td(e(t.libelle))}${td(euros(t.budget), "right")}${td(texte([t.numeroResolution, t.cleRepartition].filter(Boolean).join(" // ")))}${td(texte(t.modalitesAppelFonds))}</tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:${C.carte};border:1px solid ${C.filet};border-radius:8px;margin-top:14px">
    <tr><td style="padding:8px 12px;border-bottom:1px solid ${C.filet};color:${C.vert};font-size:10pt;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Travaux votés (${r.travaux.length})</td></tr>
    <tr><td style="padding:0"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
      <tr>${th("Libellé")}${th("Budget", "right")}${th("Résolution // clé de répartition")}${th("Modalités d'appel de fonds")}</tr>${lignes}
    </table></td></tr>
  </table>`;
}

export function htmlNotificationRecap(r: RecapANotifier, coproNom: string, lien: string): string {
  const a = r.assemblee;
  const depassement = r.depassementTtc > 0
    ? `<span style="color:${C.warn};font-weight:600">${euros(r.depassementTtc)}</span>`
    : `<span style="color:${C.encre3}">aucun</span>`;
  const assemblee = section("Assemblée", [
    ligne("Copropriété", `<strong>${e(r.coproCode)}</strong> — ${e(coproNom)}`),
    ligne("Début de l'AG", `${e(formatJour(a.jourDebut))} à ${e(formatHeure(a.heureDebut, a.minuteDebut))}`),
    ligne("Fin de l'AG", `${e(formatJour(a.jourFin))} à ${e(formatHeure(a.heureFin, a.minuteFin))}`),
    ligne("Dépassement d'AG (TTC)", depassement),
    ligne("Comptes approuvés", pastille(r.comptesApprouves)),
    ligne("Réserves", texte(r.reserves)),
  ].join(""));
  const budget = section("Budget et fonds", [
    ligne("Budget présenté modifié en AG ?", pastille(r.budgetModifie)),
    ligne("Montant du budget N+2", r.montantBudget !== undefined ? `<strong>${euros(r.montantBudget)}</strong>` : texte(undefined)),
    ligne("Pourcentage budget (fonds travaux)", pourcent(r.pourcentageBudget)),
    ligne("Fonds travaux", pastille(r.fondsTravaux)),
    ligne("PPT voté à cette AG ?", pastille(r.pptVote)),
    ligne("Pourcentage PPT", pourcent(r.pourcentagePpt)),
    ligne("Montant PPT", euros(r.montantPpt)),
    ligne("Travaux votés", r.travaux.length > 0 ? `${r.travaux.length}` : pastille(false)),
  ].join(""));
  const travaux = tableauTravaux(r);
  const note = r.infoComptable && r.infoComptable.trim()
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-top:14px"><tr><td style="padding:10px 12px;background:${C.warn50};border-left:3px solid ${C.warn};color:${C.encre};font-size:10.5pt"><strong>Informations utiles pour le comptable</strong><br/>${e(r.infoComptable)}</td></tr></table>`
    : "";
  const contrat = r.debutContrat || r.honorairesGestionTtc !== undefined
    ? section("Nouveau contrat", [
        ligne("Honoraires de gestion courante (TTC)", `<strong>${euros(r.honorairesGestionTtc)}</strong>`),
        ligne("Frais postaux", r.fraisPostauxReels ? "au réel" : euros(r.forfaitPostauxTtc)),
        ligne("Début du contrat", r.debutContrat ? e(formatJour(r.debutContrat)) : texte(undefined)),
      ].join(""))
    : "";

  return `<div style="background:${C.papier};padding:20px 12px;${POLICE}color:${C.encre}">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;border-collapse:collapse">
    <tr><td style="padding:14px 16px;background:${C.vert};color:#FFFFFF;border-radius:8px 8px 0 0">
      <div style="font-size:9.5pt;letter-spacing:.08em;text-transform:uppercase;opacity:.85">REAL31 · Récap d'assemblée générale</div>
      <div style="font-size:15pt;font-weight:700;margin-top:2px">${e(r.coproCode)} — AG du ${e(formatJour(a.jourDebut))}</div>
      <div style="font-size:10pt;opacity:.85;margin-top:2px">${e(coproNom)}${r.par ? ` · saisi par ${e(r.par)}` : ""}</div>
    </td></tr>
    <tr><td style="padding:0 0 4px">
      ${assemblee}${budget}${travaux}${note}${contrat}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px auto 6px"><tr><td style="background:${C.vert600};border-radius:6px">
        <a href="${e(lien)}" style="display:inline-block;padding:9px 16px;color:#FFFFFF;text-decoration:none;font-size:10.5pt;font-weight:600">Ouvrir le récap dans l'intranet</a>
      </td></tr></table>
      <p style="text-align:center;color:${C.encre3};font-size:9pt;margin:8px 0 0">Message envoyé automatiquement par l'intranet REAL31 à l'enregistrement du récap.</p>
    </td></tr>
  </table>
</div>`;
}
