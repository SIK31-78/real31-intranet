// Generation du COURRIER "fiche de renseignements" en HTML imprimable (une page A4 par
// coproprietaire, saut de page CSS, bouton Imprimer -> le navigateur gere l'impression /
// le PDF). PUR : aucune dependance (pas de lib docx, pas de reseau). Reproduit fidelement
// le modele du cabinet docs/Fiche_renseignements_REAL31_template_eStale.docx (en-tete,
// bloc destinataire, texte d'accueil, acces extranet, les 8 sections, date/signature),
// avec en tete un ENCADRE "repondez en ligne" portant le LIEN + le CODE PERSONNEL.
//
// Les champs pre-remplis viennent du jeu persiste (DonneesConnues). Les cases a cocher sont
// laissees vides (le coproprietaire remplit en ligne OU coche sur le papier et renvoie).

import type { DonneesConnues } from "@/lib/reprise/domain/fiche-renseignements";

/** Contexte copro commun a tous les courriers d'un lot. */
export interface ContexteCourrier {
  coproNom: string;
  coproRef: string;
  coproAdresseLigne1?: string;
  coproCodePostalVille?: string;
  /** Email de retour papier/scan (modele cabinet : syndic4@real31.fr). */
  retourEmail: string;
  /** Email du gestionnaire (mention RGPD + contact). */
  gestionnaireEmail?: string;
  /** Bloc adresse expediteur (cabinet), lignes libres. */
  expediteur?: string[];
}

/** Un courrier individuel : le owner + son lien/code personnels. */
export interface CourrierOwner {
  ownerId: string;
  connues: DonneesConnues;
  /** URL publique complete (avec le token) OU relative si base inconnue. */
  lien: string;
  /** Code personnel imprime (a saisir sur la page). */
  code: string;
  /** true si c'est une relance (mention "RELANCE" en tete). */
  relance?: boolean;
}

/** Echappe le HTML (noms/adresses owners = donnees externes). */
function esc(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "Civilite NOM Prenom" compacte, sans espaces superflus. */
function nomComplet(c: DonneesConnues): string {
  return [c.civilite, c.nom, c.prenom].filter((x) => x && String(x).trim()).join(" ").trim();
}

function adresseLigne1(c: DonneesConnues): string {
  return [c.adrNum, c.adrVoie].filter((x) => x && String(x).trim()).join(" ").trim();
}

function cpVille(c: DonneesConnues): string {
  return [c.adrCodePostal, c.adrVille].filter((x) => x && String(x).trim()).join(" ").trim();
}

/** Case a cocher vide (papier). */
const BOX = "☐";

/** Ligne d'un tableau "info / donnee preremplie / correction". */
function ligneInfo(label: string, valeur: string, correction = true): string {
  return `<tr>
    <td class="lbl">${esc(label)}</td>
    <td class="val">${esc(valeur) || "<span class='vide'>&mdash;</span>"}</td>
    ${correction ? `<td class="corr"></td>` : ""}
  </tr>`;
}

/** Une page courrier (un owner). Fragment HTML (pas de <html>/<head>). */
export function genererCourrierPage(ctx: ContexteCourrier, courrier: CourrierOwner): string {
  const c = courrier.connues;
  const dest = nomComplet(c);
  const lots = (c.lots ?? []).join(", ");

  return `<section class="page">
  <header class="entete">
    <div class="exp">
      ${(ctx.expediteur ?? ["REAL 31"]).map((l) => `<div>${esc(l)}</div>`).join("")}
      <div class="site">www.real31.fr</div>
    </div>
    <div class="dest">
      <div>${esc(dest)}</div>
      ${c.adrComplement ? `<div>${esc(c.adrComplement)}</div>` : ""}
      <div>${esc(adresseLigne1(c))}</div>
      <div>${esc(cpVille(c))}</div>
      ${c.pays && c.pays !== "France" ? `<div>${esc(c.pays)}</div>` : ""}
    </div>
  </header>

  ${courrier.relance ? `<div class="relance">RELANCE &mdash; document deja adresse, merci de le completer</div>` : ""}

  <div class="accueil">
    <p><strong>Bienvenue chez REAL31,</strong></p>
    <p>Nous sommes ravis de vous compter parmi nos clients. Afin de completer votre dossier, nous vous invitons a remplir le formulaire de renseignements ci-dessous.</p>
    <p>Une fois votre fiche recue, nous l'integrerons a notre base de donnees et vous adresserons un e-mail. C'est a la reception de ce mail que vous pourrez creer votre compte sur votre extranet proprietaire.</p>
  </div>

  <div class="encadre-web">
    <div class="ew-titre">Le plus simple : repondez en ligne</div>
    <div class="ew-lien">${esc(courrier.lien)}</div>
    <div class="ew-code">Votre code personnel : <strong>${esc(courrier.code)}</strong></div>
    <div class="ew-note">Rendez-vous a l'adresse ci-dessus, saisissez votre code personnel, verifiez et completez vos informations. A defaut, completez ce document et retournez-le par courrier ou par email a ${esc(ctx.retourEmail)}.</div>
  </div>

  <h1 class="titre">FICHE DE RENSEIGNEMENTS COPROPRIETAIRE</h1>
  <p class="mode">Certaines informations ont ete preremplies a partir de nos dossiers. Verifiez-les : si une donnee est inexacte, indiquez la bonne valeur dans la colonne &laquo; Correction eventuelle &raquo;. Les rubriques sans pre-remplissage sont a completer.</p>

  <h2>1 &middot; Votre copropriete</h2>
  <table class="grille">
    <tbody>
      ${ligneInfo("Copropriete", ctx.coproNom, false)}
      ${ligneInfo("Reference dossier", ctx.coproRef, false)}
      ${ligneInfo("Adresse de l'immeuble", ctx.coproAdresseLigne1 ?? "", false)}
      ${ligneInfo("Code postal / Ville", ctx.coproCodePostalVille ?? "", false)}
    </tbody>
  </table>

  <h2>2 &middot; Vos coordonnees</h2>
  <table class="grille">
    <thead><tr><th>Information</th><th>Donnee enregistree</th><th>Correction eventuelle</th></tr></thead>
    <tbody>
      ${ligneInfo("Civilite, nom, prenom", dest)}
      ${ligneInfo("Adresse (n° et rue)", adresseLigne1(c))}
      ${ligneInfo("Complement d'adresse", c.adrComplement ?? "")}
      ${ligneInfo("Code postal / Ville", cpVille(c))}
      ${ligneInfo("Pays", c.pays ?? "France")}
      ${ligneInfo("Telephone fixe", c.telFixe ?? "")}
      ${ligneInfo("Telephone portable", c.telPortable ?? "")}
      ${ligneInfo("Email", c.emailConnu ?? "")}
    </tbody>
  </table>
  <p class="pm">Societe, SCI ou indivision : precisez la denomination, la forme juridique et le mandataire commun. Second coproprietaire / co-indivisaire le cas echeant.</p>

  <h2>3 &middot; Identification de vos lots</h2>
  <p class="pm">Nature : appartement, cave, parking, bureau&hellip; &mdash; Situation : batiment, escalier, etage, n° de porte.</p>
  <table class="grille"><thead><tr><th>Lot n°</th><th>Nature</th><th>Situation</th></tr></thead>
    <tbody>${lots ? `<tr><td class="val">${esc(lots)}</td><td></td><td></td></tr>` : `<tr><td></td><td></td><td></td></tr>`}</tbody></table>

  <h2>4 &middot; Occupation de votre lot</h2>
  <p class="cases">${BOX} A titre de residence principale &nbsp;&nbsp; ${BOX} A titre de residence secondaire &nbsp;&nbsp; ${BOX} Le bien est loue / occupe</p>

  <h2>5 &middot; Gestion par un tiers</h2>
  <p class="pm">A completer uniquement si votre bien est gere par un administrateur de biens. Le gestionnaire regle les charges : ${BOX} Oui &nbsp; ${BOX} Non</p>

  <h2>6 &middot; Vos preferences de communication</h2>
  <p class="cases">Recevoir mes appels de fonds et correspondances par courriel : ${BOX} Oui &nbsp; ${BOX} Non</p>
  <p class="cases">Je refuse la Lettre Recommandee Electronique (LRE par defaut) : ${BOX} Oui &nbsp; ${BOX} Non</p>
  <p class="cases">Prelevement automatique (joindre un RIB) : ${BOX} Trimestriel &nbsp; ${BOX} Mensuel</p>

  <h2>7 &middot; Consentements</h2>
  <p class="cases">${BOX} J'autorise REAL 31 a transmettre mes coordonnees a des prestataires intervenant pour la copropriete (jamais a des fins commerciales).</p>
  <p class="cases">${BOX} J'accepte de recevoir les actualites de REAL 31 (facultatif, revocable a tout moment).</p>
  <p class="rgpd">Protection des donnees : informations necessaires a la gestion de votre copropriete, destinees a REAL 31 (responsable de traitement). Droit d'acces, rectification, effacement et opposition (RGPD) aupres de votre gestionnaire${ctx.gestionnaireEmail ? ` (${esc(ctx.gestionnaireEmail)})` : ""}.</p>

  <h2>8 &middot; Date et signature</h2>
  <p class="sign">Fait a &nbsp;...........................................&nbsp;&nbsp; Le &nbsp;......../......../.............<br/>Signature (precedee de &laquo; Lu et approuve &raquo;) :</p>
</section>`;
}

/** CSS commun d'impression (encapsule pour la page publique et le document courrier). */
export const CSS_COURRIER = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 11px; line-height: 1.4; margin: 0; background: #f3f4f6; }
  .barre { position: sticky; top: 0; background: #0f5132; color: #fff; padding: 10px 16px; display: flex; gap: 12px; align-items: center; }
  .barre button { background: #fff; color: #0f5132; border: 0; border-radius: 6px; padding: 7px 14px; font-weight: 600; cursor: pointer; font-size: 13px; }
  .barre span { font-size: 12px; opacity: .9; }
  .page { background: #fff; width: 210mm; min-height: 297mm; margin: 12px auto; padding: 16mm 16mm 14mm; box-shadow: 0 1px 6px rgba(0,0,0,.15); }
  .entete { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 14px; }
  .exp { font-size: 10px; color: #444; }
  .exp .site { margin-top: 4px; color: #0f5132; font-weight: 600; }
  .dest { text-align: right; font-size: 11px; }
  .relance { border: 1px solid #b45309; background: #fffbeb; color: #b45309; padding: 5px 8px; font-weight: 600; margin-bottom: 10px; font-size: 10px; }
  .accueil p { margin: 4px 0; }
  .encadre-web { border: 1.5px solid #0f5132; border-radius: 8px; padding: 10px 12px; margin: 12px 0; background: #f0fdf4; }
  .ew-titre { font-weight: 700; color: #0f5132; font-size: 12px; }
  .ew-lien { font-family: monospace; font-size: 12px; word-break: break-all; margin: 4px 0; }
  .ew-code { font-size: 13px; }
  .ew-code strong { font-family: monospace; font-size: 15px; letter-spacing: 1px; }
  .ew-note { font-size: 9.5px; color: #444; margin-top: 4px; }
  .titre { font-size: 14px; text-align: center; margin: 14px 0 6px; letter-spacing: .5px; }
  .mode { font-size: 9.5px; color: #444; margin: 0 0 8px; }
  h2 { font-size: 11.5px; background: #0f5132; color: #fff; padding: 3px 6px; margin: 10px 0 4px; border-radius: 3px; }
  table.grille { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.grille th, table.grille td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: left; vertical-align: top; }
  table.grille th { background: #f1f5f9; font-size: 9.5px; }
  td.lbl { width: 30%; background: #f8fafc; }
  td.val { width: 40%; }
  td.corr { width: 30%; }
  .vide { color: #94a3b8; }
  .pm { font-size: 9.5px; color: #444; margin: 2px 0 4px; }
  .cases { margin: 3px 0; }
  .rgpd { font-size: 9px; color: #555; margin-top: 6px; }
  .sign { margin-top: 10px; }
  @media print {
    body { background: #fff; }
    .barre { display: none; }
    .page { box-shadow: none; margin: 0; width: auto; min-height: auto; page-break-after: always; padding: 12mm; }
    .page:last-child { page-break-after: auto; }
  }
`;

/** Document HTML complet (tous les courriers), pret a ouvrir/imprimer dans un onglet. */
export function genererCourriersDocument(ctx: ContexteCourrier, courriers: CourrierOwner[]): string {
  const pages = courriers.map((co) => genererCourrierPage(ctx, co)).join("\n");
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Fiches de renseignements - ${esc(ctx.coproRef)}</title>
<style>${CSS_COURRIER}</style></head>
<body>
<div class="barre">
  <button onclick="window.print()">Imprimer / enregistrer en PDF</button>
  <span>${courriers.length} courrier(s) &mdash; ${esc(ctx.coproNom)} (${esc(ctx.coproRef)}). Une page par coproprietaire.</span>
</div>
${pages}
</body></html>`;
}
