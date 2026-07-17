/**
 * Présentation de l'assureur gestionnaire. Plomberie d'affichage : mappe le token
 * `gestionnaire` porté par l'arbre (`assureur_immeuble`, `assureur_cno`…) vers un
 * libellé français lisible.
 *
 * POURQUOI ICI. Le token est une valeur d'énumération du MOTEUR. Trois surfaces le
 * montraient à l'utilisateur via `token.replace(/_/g, ' ')` : l'écran d'étape, la
 * carte « Assureur gestionnaire » du résultat et la synthèse reportée au journal
 * du dossier. Ça rendait littéralement « assureur immeuble » - on montrait une
 * variable. Une seule table, dans le domaine, pour ces trois surfaces : deux
 * tables auraient divergé.
 *
 * Les libellés reprennent la formulation des `titre` des nœuds gestionnaires de
 * `arbre-decision-dde.json` (« Assureur gestionnaire : assureur de l'immeuble
 * (subsidiarité) »), sans leur qualificatif de parcours. Même parti pris que
 * `labelResponsable` : table explicite + repli sur le token détokenisé, pour qu'un
 * gestionnaire ajouté au JSON n'affiche jamais une chaîne vide.
 */

const GESTIONNAIRE_LABEL: Record<string, string> = {
  assureur_immeuble: "l'assureur de l'immeuble",
  assureur_coproprietaire_occupant: "l'assureur du (co)propriétaire occupant",
  assureur_occupant: "l'assureur de l'occupant non propriétaire",
  assureur_cno: "l'assureur du (co)propriétaire non occupant",
};

/** Libellé lisible d'un token gestionnaire (repli : le token détokenisé). */
export function libelleGestionnaire(gestionnaire: string): string {
  return GESTIONNAIRE_LABEL[gestionnaire] ?? gestionnaire.replace(/_/g, ' ');
}
