// Dans quel etat une facture part-elle chez le fournisseur (Pennylane) ?
//
// Vit dans le DOMAINE et pas dans l'adapter, parce que deux couches en ont besoin
// et qu'elles n'ont pas le droit de se parler (regle ESLint boundaries, ADR-001) :
// l'adapter, pour savoir s'il enchaine la validation ; les ecrans, pour DIRE la
// verite dans la fenetre de confirmation. Un ecran qui promet « il restera a
// valider » alors que la facture part validee ferait signer un geste irreversible
// sans le dire - c'est exactement ce qu'on ne veut pas.
//
// Fonctions pures : elles recoivent les valeurs d'environnement, elles ne les lisent pas.

export type ModeEmissionFacture =
  /** Aucun jeton : rien ne part reellement (adapter no-op). */
  | "inactif"
  /** Une facture BROUILLON est creee, la comptabilite la valide a la main. */
  | "brouillon"
  /** La facture est creee PUIS validee : irreversible chez le fournisseur. */
  | "validee";

/**
 * La facture doit-elle etre VALIDEE (finalisee) juste apres sa creation ?
 *
 * Pilote par `PENNYLANE_FACTURE_VALIDEE`. Defaut = NON : on cree un brouillon,
 * comme depuis l'origine du module. C'est volontairement un opt-in explicite :
 * une facture finalisee chez Pennylane ne peut PLUS etre modifiee ni supprimee
 * (« Once finalized, the resource can no longer be edited »), elle porte un
 * numero et engage la comptabilite. Un defaut qui bascule tout le cabinet sur
 * de l'irreversible ne se rattrape pas ; un opt-in se decide.
 *
 * Valeurs acceptees pour activer : oui / true / 1 / on / yes (insensible a la
 * casse et aux espaces). Tout le reste - y compris une variable presente mais
 * vide, ou une faute de frappe - laisse le brouillon. Le sens du doute va
 * toujours vers le comportement reversible.
 */
export function factureValideeActive(valeur: string | undefined): boolean {
  const v = (valeur ?? "").trim().toLowerCase();
  return v === "oui" || v === "true" || v === "1" || v === "on" || v === "yes";
}

/** Mode courant, deduit des deux variables d'environnement de facturation. */
export function modeEmissionFacture(
  cleApi: string | undefined,
  factureValidee: string | undefined,
): ModeEmissionFacture {
  if (!cleApi) return "inactif";
  return factureValideeActive(factureValidee) ? "validee" : "brouillon";
}

/** Ce que la fenetre de confirmation annonce a l'utilisateur avant d'engager. */
export function messageEmissionFacture(mode: ModeEmissionFacture): string {
  if (mode === "inactif") {
    return "Mode simulation : PENNYLANE_API_KEY absente, aucune facture ne partira réellement.";
  }
  if (mode === "validee") {
    return (
      "En confirmant, une facture VALIDÉE est créée dans Pennylane. " +
      "Elle porte un numéro et ne pourra plus être modifiée ni supprimée."
    );
  }
  return (
    "En confirmant, un brouillon de facture est créé dans Pennylane. " +
    "Il restera à valider par la comptabilité."
  );
}
