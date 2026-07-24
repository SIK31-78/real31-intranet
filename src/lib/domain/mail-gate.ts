// Gates de rollout du module mail (extrait de session.ts, place en domain/ car regle
// metier PURE : qui a acces au mail selon la config env, aucune dep technique ni auth).
// session.ts re-exporte ces symboles pour la retro-compat.
//
//   MAIL_SOURCE=graph          : le provider Graph reel est branche (sinon = Noop).
//   MAIL_PILOTES=a@x,b@y       : allowlist des emails habilites (vide = tous).
//
// Utilisations :
//   - mailModuleActif()        : gate GLOBAL (ex. bouton "mail au CS", ouvert des que
//                                le provider Graph est actif, cf. mail-reunion-actions).
//   - mailModuleActifPour(...) : double gate GLOBAL + allowlist (module "Mes e-mails",
//                                brouillons/agenda sinistre, projection Outlook AG/CS...).

export function mailModuleActif(): boolean {
  return process.env.MAIL_SOURCE === "graph";
}

// Parse a chaque appel : les env de Next 16 peuvent changer selon le contexte de
// rendu (build vs runtime). Le cout est negligeable (split d'une chaine courte).
function pilotes(): string[] {
  return (process.env.MAIL_PILOTES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Le module mail est-il actif POUR ce gestionnaire (gate global + allowlist pilotes) ? */
export function mailModuleActifPour(email: string | null | undefined): boolean {
  if (!mailModuleActif()) return false;
  const liste = pilotes();
  if (liste.length === 0) return true;
  return Boolean(email && liste.includes(email.toLowerCase()));
}
