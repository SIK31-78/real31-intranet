/**
 * Présentation des responsables de mesures (D-1). Plomberie d'affichage :
 * mappe le token `responsable` (donnée) vers un libellé lisible, et décide si
 * l'action revient au gestionnaire (« Fait ») ou à un tiers (« Demandé »).
 */

const RESPONSABLE_LABEL: Record<string, string> = {
  gestionnaire: 'gestionnaire',
  occupant: "occupant / propriétaire du lot",
  parties: 'parties concernées (le gestionnaire coordonne)',
  gestionnaire_ou_occupant: 'gestionnaire ou occupant',
};

/** Le gestionnaire « fait » ; les tiers se voient « demander » l'action. */
export function estActionGestionnaire(responsable: string): boolean {
  return responsable === 'gestionnaire' || responsable === 'gestionnaire_ou_occupant';
}

/** Verbe de l'état réalisé selon le responsable : « Fait » ou « Demandé ». */
export function verbeFait(responsable: string): string {
  return estActionGestionnaire(responsable) ? 'Fait' : 'Demandé';
}

export function labelResponsable(responsable: string): string {
  return RESPONSABLE_LABEL[responsable] ?? responsable.replace(/_/g, ' ');
}
