// Messages de la facturation partagés entre les Server Actions et l'écran.
//
// Ils vivent ici et pas dans actions.ts : un fichier « use server » ne peut exporter QUE des
// fonctions asynchrones. Une constante exportée depuis actions.ts rendait le module vide au
// `next build` (« The module has no exports at all ») : la prod n'a plus été déployée du
// 20/10/2026 à 11 h 54 jusqu'à ce correctif, sans que tsc, eslint ni vitest ne le voient.

export const MESSAGE_EMISSION_TECHNIQUE =
  "l'envoi chez Pennylane a échoué (erreur technique, signalée). La facture est dans l'historique, en erreur : à renvoyer.";
