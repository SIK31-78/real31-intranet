// Service : prepare le mail au conseil syndical qui accompagne l'ODJ (REA-146).
//
// Decision Sekou : un BROUILLON dans la boite Outlook du gestionnaire connecte, jamais un
// envoi direct. Le brouillon porte :
//   - les destinataires du CS, par la MEME cascade que le mail des dates (ESTALE d'abord,
//     liste de diffusion de secours ensuite : destinataires-conseil) ;
//   - un objet et un corps courts (domain/odj-mail-cs) ;
//   - l'ODJ rempli en PDF, genere ICI cote serveur (pas de fetch HTTP de la route).
// Le gestionnaire l'ouvre par le lien Outlook rendu, relit, et envoie lui-meme.
//
// Liste du CS vide : AUCUN brouillon (un mail sans destinataire n'aide personne) et un
// message qui dit ou completer la liste.
//
// Permission Graph : creer un message dans /users/{boite}/messages = Mail.ReadWrite
// (Application), deja accordee et bornee par l'Application Access Policy (ADR-027). Pas de
// Mail.Send : rien ne part d'ici.
//
// Passe par le routeur (ADR-001).

import "server-only";
import { getMailOutboundProvider } from "@/lib/adapters/router";
import { mailOdjAuConseil } from "@/lib/domain/odj-mail-cs";
import { destinatairesConseilSyndical } from "@/lib/services/coproprietes/destinataires-conseil";
import { getOdj } from "./get-odj";
import { pdfOdjRempli } from "./generer-odj-rempli";

/** Plafond de la piece jointe : elle voyage en base64 (+33 %) dans la requete de creation
 *  du brouillon, que Graph limite a ~4 Mo. Un ODJ fait quelques centaines de Ko. */
export const PDF_MAX_OCTETS = 2_500_000;

export const MESSAGE_LISTE_VIDE =
  "Aucune adresse connue pour le conseil syndical de cette copropriété : complétez la liste de diffusion sur la fiche copro, puis recommencez.";

export type ResultatMailOdjCs =
  | { ok: true; webLink?: string; destinataires: number }
  | { ok: false; erreur: string };

export async function preparerMailOdjAuConseil(params: {
  idOdj: string;
  gestionnaireId: string;
  /** Boite du gestionnaire CONNECTE (session), jamais un parametre client. */
  boite: string;
}): Promise<ResultatMailOdjCs> {
  const { idOdj, gestionnaireId, boite } = params;
  const odj = await getOdj(idOdj, gestionnaireId, { transverse: true });
  if (!odj) return { ok: false, erreur: "Copropriété introuvable." };

  const { emails } = await destinatairesConseilSyndical(odj.copro.code);
  if (emails.length === 0) return { ok: false, erreur: MESSAGE_LISTE_VIDE };

  const pdf = await pdfOdjRempli(odj);
  if (pdf.contenu.length > PDF_MAX_OCTETS) {
    return {
      ok: false,
      erreur: "Le PDF de l'ordre du jour est trop lourd pour être joint : téléchargez-le et joignez-le à la main.",
    };
  }

  const { sujet, corps } = mailOdjAuConseil(odj);
  const { webLink } = await getMailOutboundProvider().creerBrouillonNeuf({
    boite,
    sujet,
    corps,
    a: emails,
    piecesJointes: [{ nom: pdf.nomFichier, contentType: "application/pdf", base64: pdf.contenu.toString("base64") }],
  });
  return { ok: true, destinataires: emails.length, ...(webLink ? { webLink } : {}) };
}
