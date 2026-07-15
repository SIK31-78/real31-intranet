// Modele du mail "votre espace client est pret" envoye AUTOMATIQUEMENT au coproprietaire
// quand le gestionnaire valide sa fiche de renseignements (l'email vient d'etre ecrit dans
// eStale -> l'extranet peut etre cree). Logique PURE (domaine, ADR-001) : compose objet +
// corps. Pas de signature dans le corps : Signitic l'ajoute a l'envoi (comme mail-reunion).
//
// Ton sobre, verbatim de l'accueil du modele cabinet (Fiche_renseignements template) : on
// reprend la mecanique "cliquez sur Extranet -> Extranet Syndic ESTALE".

/** Infos pour composer le mail espace client. */
export interface InfosMailEspaceClient {
  /** Prenom/nom ou civilite+nom pour l'accroche ("Bonjour M. DUPONT,"). */
  destinataire: string;
  coproNom: string;
  coproRef: string;
}

/** Objet du mail : reference copro + intention. */
export function objetMailEspaceClient(infos: InfosMailEspaceClient): string {
  return `${infos.coproRef} - Votre espace client REAL31 est pret`;
}

/**
 * Corps du mail (texte brut, \n ; l'adapter le rend en HTML). Pas de signature (Signitic).
 * Sobre : on confirme la prise en compte de l'email et on explique l'acces a l'extranet.
 */
export function corpsMailEspaceClient(infos: InfosMailEspaceClient): string {
  const accroche = infos.destinataire.trim() ? `Bonjour ${infos.destinataire.trim()},` : "Bonjour,";
  return [
    accroche,
    "",
    `Nous vous remercions d'avoir complete votre fiche de renseignements pour la copropriete ${infos.coproNom} (${infos.coproRef}).`,
    "",
    "Votre adresse email a bien ete enregistree dans notre systeme : vous pouvez desormais creer votre compte sur votre extranet proprietaire.",
    "",
    "Pour y acceder :",
    "- rendez-vous sur www.real31.fr,",
    "- cliquez sur « Extranet » en haut a gauche,",
    "- selectionnez « Extranet Syndic ESTALE » (veillez a bien choisir ESTALE et non un autre extranet),",
    "- suivez la procedure de creation de compte avec cette adresse email.",
    "",
    "Pour toute question, n'hesitez pas a nous contacter.",
    "",
    "Cordialement,",
  ].join("\n");
}
