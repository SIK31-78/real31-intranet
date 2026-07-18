// Modele du mail "fiche de renseignements a completer" envoye au coproprietaire QUAND un email
// valide est deja connu (bonus email de la reprise) : on remplace le courrier postal par un mail
// portant le LIEN + le CODE personnel vers le formulaire en ligne. Logique PURE (domaine, ADR-001) :
// compose objet + corps. Pas de signature dans le corps : elle est ajoutee a l'envoi (comme
// mail-reunion / mail-espace-client). Meme contenu utile que l'encadre "repondez en ligne" du
// courrier, sans QR (inutile par email : le lien est cliquable).

import { formaterCode } from "@/lib/reprise/domain/fiche-courrier";

export interface InfosMailFiche {
  /** Accroche ("Bonjour M. DUPONT,") : civilite+nom ou vide. */
  destinataire: string;
  coproNom: string;
  coproRef: string;
  /** URL publique tokenisee du formulaire. */
  lien: string;
  /** Code personnel EN CLAIR (n'existe qu'au moment de l'envoi). */
  code: string;
}

/** Objet du mail : reference copro + intention. */
export function objetMailFicheRenseignements(infos: Pick<InfosMailFiche, "coproNom" | "coproRef">): string {
  return `${infos.coproRef} - Votre fiche de renseignements REAL31 (${infos.coproNom})`;
}

/**
 * Corps du mail (texte brut, \n ; l'adapter le rend en HTML). MEME contenu que le courrier : accueil
 * cabinet + acces au formulaire (lien + code), sans QR. Pas de signature (ajoutee a l'envoi).
 */
export function corpsMailFicheRenseignements(infos: InfosMailFiche): string {
  const accroche = infos.destinataire.trim() ? `Bonjour ${infos.destinataire.trim()},` : "Bonjour,";
  return [
    accroche,
    "",
    "Bienvenue chez REAL31. Nous sommes ravis de vous compter parmi nos clients.",
    "",
    `Afin de completer votre dossier pour la copropriete ${infos.coproNom} (${infos.coproRef}), nous vous invitons a remplir votre fiche de renseignements en ligne :`,
    "",
    `- Lien : ${infos.lien}`,
    `- Votre code personnel : ${formaterCode(infos.code)}`,
    "",
    "Rendez-vous a l'adresse ci-dessus, saisissez votre code personnel, verifiez et completez vos informations (email, telephone, coordonnees).",
    "",
    "Une fois votre fiche recue, nous l'integrerons a notre base et vous adresserons un email : c'est a la reception de ce mail que vous pourrez creer votre compte sur votre extranet proprietaire.",
    "",
    "Pour toute question, n'hesitez pas a nous contacter.",
    "",
    "Cordialement,",
  ].join("\n");
}
