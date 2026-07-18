/**
 * Coordonnées du cabinet (syndic) - constantes d'en-tête des courriers.
 *
 * Domaine pur (zéro dépendance technique). Ces valeurs alimentent les clés de
 * fusion `syndic.*` des gabarits. Le gestionnaire-signataire (`gestionnaire.*`),
 * lui, vient du dossier en cours (utilisateur courant), pas d'ici.
 *
 * TODO valider les coordonnées exactes du cabinet (adresse postale, email et
 * téléphone de contact sinistres officiels) avant mise en production.
 */
export const CABINET = {
  nom: 'REAL31',
  adresse: '31 boulevard du Maréchal Foch, 31000 Toulouse',
  email: 'contact@real31.fr',
  telephone: '',
} as const;
