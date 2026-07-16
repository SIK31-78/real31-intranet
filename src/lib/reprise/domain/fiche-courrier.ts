// Generation du COURRIER "fiche de renseignements" en HTML imprimable (une page A4 par
// coproprietaire, saut de page CSS, bouton Imprimer -> le navigateur gere l'impression /
// le PDF). PUR : aucune dependance (pas de lib docx, pas de reseau, pas de lib QR). Le QR
// (SVG deja rendu cote service) est injecte tel quel. Reproduit FIDELEMENT le modele du
// cabinet docs/Fiche_renseignements_REAL31_template_eStale.docx (en-tete, bloc destinataire,
// texte d'accueil accentue, acces extranet, les 8 sections aux libelles EXACTS, date /
// signature), avec en tete un ENCADRE "repondez en ligne" portant le QR + le LIEN + le CODE.
//
// Fidelite : le texte est en francais accentue (UTF-8) exactement comme le docx. Aucune
// translitteration : un nom accentue (« Mme Bérard ») doit ressortir intact. echapperHtml
// n'echappe QUE les meta-caracteres HTML (& < > " ') et ne touche jamais aux accents.
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
  /** QR code (SVG deja rendu cote service, encode le lien tokenise complet). Optionnel :
   *  absent -> l'encadre affiche seulement le lien + le code (pas de <img>/lib dans le domaine). */
  qrSvg?: string;
  /** true si c'est une relance (mention "RELANCE" en tete). */
  relance?: boolean;
}

/** Echappe le HTML (noms/adresses owners = donnees externes). N'affecte PAS les accents. */
function esc(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "Civilité NOM Prénom" compacte, sans espaces superflus. Accents preserves. */
function nomComplet(c: DonneesConnues): string {
  return [c.civilite, c.nom, c.prenom].filter((x) => x && String(x).trim()).join(" ").trim();
}

function adresseLigne1(c: DonneesConnues): string {
  return [c.adrNum, c.adrVoie].filter((x) => x && String(x).trim()).join(" ").trim();
}

function cpVille(c: DonneesConnues): string {
  return [c.adrCodePostal, c.adrVille].filter((x) => x && String(x).trim()).join(" ").trim();
}

/**
 * Formate le code personnel pour la saisie papier : groupes de 4 (« 4F7K-2Q9C »). La
 * normalisation serveur tolere deja les tirets/espaces/minuscules (fiche-token).
 */
export function formaterCode(code: string): string {
  const brut = String(code).replace(/[^0-9A-Za-z]/g, "");
  if (brut.length <= 4) return brut;
  const mid = Math.ceil(brut.length / 2);
  return `${brut.slice(0, mid)}-${brut.slice(mid)}`;
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

  ${courrier.relance ? `<div class="relance">RELANCE &mdash; document déjà adressé, merci de le compléter</div>` : ""}

  <div class="accueil">
    <p><strong>Bienvenue chez REAL31,</strong></p>
    <p>Nous sommes ravis de vous compter parmi nos clients.</p>
    <p>Afin de compléter votre dossier, nous vous invitons à remplir le formulaire de renseignements ci-dessous.</p>
    <p>Une fois votre fiche reçue, nous l'intégrerons à notre base de données et vous adresserons un e-mail. C'est à la réception de ce mail que vous pourrez créer votre compte sur votre extranet propriétaire.</p>
  </div>

  <div class="acces">
    <div class="acces-titre">Accès à l'extranet</div>
    <p>Rendez-vous sur le site Real31, cliquez sur &laquo;&nbsp;Extranet&nbsp;&raquo; en haut à gauche, puis sélectionnez &laquo;&nbsp;Extranet Syndic ESTALE&nbsp;&raquo;. Attention : veillez à bien sélectionner ESTALE et non un autre extranet. Pour toute question, n'hésitez pas à nous contacter.</p>
  </div>

  <div class="encadre-web">
    ${courrier.qrSvg ? `<div class="ew-qr">${courrier.qrSvg}<div class="ew-qr-note">Scannez pour répondre</div></div>` : ""}
    <div class="ew-corps">
      <div class="ew-titre">Le plus simple : répondez en ligne</div>
      <div class="ew-lien">${esc(courrier.lien)}</div>
      <div class="ew-code-label">Votre code personnel</div>
      <div class="ew-code">${esc(formaterCode(courrier.code))}</div>
      <div class="ew-note">Rendez-vous à l'adresse ci-dessus (ou scannez le QR code), saisissez votre code personnel, vérifiez et complétez vos informations. À défaut, complétez ce document et retournez-le par courrier ou par email à ${esc(ctx.retourEmail)}.</div>
    </div>
  </div>

  <h1 class="titre">FICHE DE RENSEIGNEMENTS COPROPRIÉTAIRE</h1>
  <p class="mode">À vérifier, compléter et nous retourner par courrier ou par email à ${esc(ctx.retourEmail)}. Comment remplir cette fiche : certaines informations ont été préremplies à partir de nos dossiers. Vérifiez-les : si une donnée est inexacte, indiquez la bonne valeur dans la colonne &laquo;&nbsp;Correction éventuelle&nbsp;&raquo;. Les rubriques sans pré-remplissage sont à compléter de votre main.</p>

  <h2>1 &middot; VOTRE COPROPRIÉTÉ</h2>
  <table class="grille">
    <thead><tr><th>Information</th><th>Donnée enregistrée (préremplie)</th></tr></thead>
    <tbody>
      ${ligneInfo("Copropriété", ctx.coproNom, false)}
      ${ligneInfo("Référence dossier", ctx.coproRef, false)}
      ${ligneInfo("Adresse de l'immeuble", ctx.coproAdresseLigne1 ?? "", false)}
      ${ligneInfo("Code postal / Ville", ctx.coproCodePostalVille ?? "", false)}
    </tbody>
  </table>

  <h2>2 &middot; VOS COORDONNÉES</h2>
  <table class="grille">
    <thead><tr><th>Information</th><th>Donnée enregistrée (préremplie)</th><th>Correction éventuelle</th></tr></thead>
    <tbody>
      ${ligneInfo("Civilité, nom, prénom", dest)}
      ${ligneInfo("Adresse (n° et rue)", adresseLigne1(c))}
      ${ligneInfo("Complément d'adresse", c.adrComplement ?? "")}
      ${ligneInfo("Code postal / Ville", cpVille(c))}
      ${ligneInfo("Pays", c.pays ?? "France")}
      ${ligneInfo("Téléphone fixe", c.telFixe ?? "")}
      ${ligneInfo("Téléphone portable", c.telPortable ?? "")}
      ${ligneInfo("Email", c.emailConnu ?? "")}
    </tbody>
  </table>
  <p class="pm">Société, SCI ou indivision : précisez ci-dessous la dénomination, la forme juridique et le mandataire commun. Second copropriétaire / co-indivisaire le cas échéant.</p>

  <h2>3 &middot; IDENTIFICATION DE VOS LOTS</h2>
  <p class="pm">Nature : appartement, cave, parking, bureau, boutique&hellip; &mdash; Situation : bâtiment, escalier, étage, n° de porte/emplacement.</p>
  <table class="grille"><thead><tr><th>Lot n°</th><th>Nature</th><th>Situation</th></tr></thead>
    <tbody>${lots ? `<tr><td class="val">${esc(lots)}</td><td></td><td></td></tr>` : `<tr><td></td><td></td><td></td></tr>`}</tbody></table>

  <h2>4 &middot; OCCUPATION DE VOTRE LOT</h2>
  <p class="cases">${BOX} À titre de résidence principale &nbsp;&nbsp; ${BOX} À titre de résidence secondaire &nbsp;&nbsp; ${BOX} Le bien est loué / occupé</p>

  <h2>5 &middot; GESTION DE VOTRE BIEN PAR UN TIERS</h2>
  <p class="pm">À compléter uniquement si votre bien est géré par un administrateur de biens / gestionnaire. Le gestionnaire règle les charges de copropriété : ${BOX} Oui &nbsp; ${BOX} Non</p>

  <h2>6 &middot; VOS PRÉFÉRENCES DE COMMUNICATION</h2>
  <p class="cases">Je souhaite recevoir mes appels de fonds et correspondances par courriel : ${BOX} Oui &nbsp; ${BOX} Non</p>
  <p class="cases">Je refuse la Lettre Recommandée Électronique (LRE par défaut) pour mes notifications : ${BOX} Oui &nbsp; ${BOX} Non</p>
  <p class="cases">Prélèvement automatique de mes charges (joindre un RIB) : ${BOX} Trimestriel &nbsp; ${BOX} Mensuel</p>

  <h2>7 &middot; CONSENTEMENTS</h2>
  <p class="cases">${BOX} J'autorise REAL 31 à transmettre mes coordonnées à des prestataires intervenant pour la copropriété (par exemple pour une intervention technique ou en cas d'urgence). Ces informations ne seront jamais utilisées à des fins commerciales.</p>
  <p class="cases">${BOX} J'accepte de recevoir les actualités de REAL 31 (facultatif, révocable à tout moment).</p>
  <p class="rgpd">Protection des données : les informations recueillies sont nécessaires à la gestion de votre copropriété et destinées à REAL 31 (responsable de traitement). Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement et d'opposition, à exercer auprès de votre gestionnaire${ctx.gestionnaireEmail ? ` (${esc(ctx.gestionnaireEmail)})` : ""}.</p>

  <h2>8 &middot; DATE ET SIGNATURE</h2>
  <p class="sign">Fait à &nbsp;...........................................&nbsp;&nbsp; Le &nbsp;......../......../.............<br/>Signature (précédée de &laquo;&nbsp;Lu et approuvé&nbsp;&raquo;) :</p>
</section>`;
}

/** CSS commun d'impression (encapsule pour la page publique et le document courrier). */
export const CSS_COURRIER = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 10.5px; line-height: 1.35; margin: 0; background: #f3f4f6; }
  .barre { position: sticky; top: 0; background: #0f5132; color: #fff; padding: 10px 16px; display: flex; gap: 12px; align-items: center; }
  .barre button { background: #fff; color: #0f5132; border: 0; border-radius: 6px; padding: 7px 14px; font-weight: 600; cursor: pointer; font-size: 13px; }
  .barre span { font-size: 12px; opacity: .9; }
  .page { background: #fff; width: 210mm; min-height: 297mm; margin: 12px auto; padding: 12mm 14mm 10mm; box-shadow: 0 1px 6px rgba(0,0,0,.15); }
  .entete { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 10px; }
  .exp { font-size: 10px; color: #444; }
  .exp .site { margin-top: 4px; color: #0f5132; font-weight: 600; }
  .dest { text-align: right; font-size: 11px; }
  .relance { border: 1px solid #000; background: #fffbeb; color: #000; padding: 5px 8px; font-weight: 700; margin-bottom: 8px; font-size: 10px; }
  .accueil p { margin: 3px 0; }
  .acces { margin: 8px 0; }
  .acces-titre { font-weight: 700; color: #0f5132; font-size: 11px; }
  .acces p { margin: 2px 0; }
  /* Encadre "repondez en ligne" : concu pour l'IMPRESSION N&B (bordure noire epaisse,
     aucune info portee UNIQUEMENT par la couleur ; print-color-adjust force le rendu). */
  .encadre-web {
    border: 2px solid #000; border-radius: 6px; padding: 8px 10px; margin: 10px 0;
    display: flex; gap: 12px; align-items: center;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .ew-qr { flex: 0 0 auto; text-align: center; }
  .ew-qr svg { width: 34mm; height: 34mm; display: block; }
  .ew-qr-note { font-size: 8px; color: #000; margin-top: 2px; }
  .ew-corps { flex: 1 1 auto; }
  .ew-titre { font-weight: 700; font-size: 12px; }
  .ew-lien { font-family: monospace; font-size: 11px; word-break: break-all; margin: 3px 0; }
  .ew-code-label { font-size: 10px; margin-top: 4px; }
  .ew-code { font-family: monospace; font-weight: 700; font-size: 22px; letter-spacing: 3px; border: 1.5px solid #000; display: inline-block; padding: 2px 10px; margin: 2px 0; }
  .ew-note { font-size: 9px; color: #333; margin-top: 4px; }
  .titre { font-size: 14px; text-align: center; margin: 12px 0 5px; letter-spacing: .5px; }
  .mode { font-size: 9px; color: #444; margin: 0 0 7px; }
  h2 {
    font-size: 11px; background: #0f5132; color: #fff; padding: 3px 6px; margin: 9px 0 4px; border-radius: 3px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  table.grille { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.grille th, table.grille td { border: 1px solid #94a3b8; padding: 3px 5px; text-align: left; vertical-align: top; }
  table.grille th { background: #eef2f6; font-size: 9px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  td.lbl { width: 30%; background: #f5f7fa; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  td.val { width: 40%; }
  td.corr { width: 30%; }
  .vide { color: #94a3b8; }
  .pm { font-size: 9px; color: #444; margin: 2px 0 4px; }
  .cases { margin: 3px 0; }
  .rgpd { font-size: 8.5px; color: #555; margin-top: 5px; }
  .sign { margin-top: 8px; }
  @media print {
    body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .barre { display: none; }
    .page { box-shadow: none; margin: 0; width: auto; min-height: auto; page-break-after: always; padding: 10mm 12mm; }
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
  <span>${courriers.length} courrier(s) &mdash; ${esc(ctx.coproNom)} (${esc(ctx.coproRef)}). Une page par copropriétaire.</span>
</div>
${pages}
</body></html>`;
}
