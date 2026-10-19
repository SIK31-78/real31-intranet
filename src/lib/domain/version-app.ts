// Version de l'application en ligne (REA-312). Un onglet resté ouvert pendant une mise en
// ligne porte le code de l'ancienne version : ses Server Actions n'existent plus côté
// serveur (« UnrecognizedActionError »), l'enregistrement échoue sans explication. La
// Skew Protection de Vercel garde l'ancienne version joignable un temps ; au-delà, on
// prévient la personne au lieu de la laisser deviner.
// Pur.

/** Valeur de repli hors Vercel (poste de dev, tests) : jamais comparée. */
export const VERSION_INCONNUE = "dev";

/** La version de ce build : l'identifiant du déploiement Vercel, à défaut le commit. */
export function versionDuBuild(env: Record<string, string | undefined>): string {
  return env.VERCEL_DEPLOYMENT_ID || env.VERCEL_GIT_COMMIT_SHA || VERSION_INCONNUE;
}

/** Une nouvelle version est en ligne : les deux sont connues et diffèrent. */
export function versionChangee(locale: string, enLigne: string | null | undefined): boolean {
  if (!enLigne || locale === VERSION_INCONNUE || enLigne === VERSION_INCONNUE) return false;
  return locale !== enLigne;
}

/** L'erreur levée par Next quand l'onglet appelle une Server Action d'une ancienne version. */
export function estErreurVersionPerimee(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { name, message } = e as { name?: unknown; message?: unknown };
  if (name === "UnrecognizedActionError") return true;
  return typeof message === "string" && /Server Action .* was not found/i.test(message);
}

/** Un onglet caché moins longtemps que ça n'est pas « laissé ouvert » : on ne recharge pas. */
export const ABSENCE_MIN_MS = 60 * 1000;

/**
 * Recharger tout seul un onglet périmé ? Oui seulement quand la personne REVIENT sur un
 * onglet resté caché (pas sous ses yeux), qu'une nouvelle version est en ligne, et que rien
 * n'est en cours de saisie ni de fenêtre ouverte : on ne perd jamais un texte. Sentry du
 * 19/10/2026 : l'onglet E-mails de Nicolas, ouvert depuis le vendredi, parlait au serveur du
 * lundi (au-delà de la Skew Protection) et plantait au premier clic.
 */
export function rechargerTout(p: { nouvelleVersion: boolean; cacheDepuisMs: number; saisieEnCours: boolean; fenetreOuverte: boolean }): boolean {
  return p.nouvelleVersion && p.cacheDepuisMs >= ABSENCE_MIN_MS && !p.saisieEnCours && !p.fenetreOuverte;
}
