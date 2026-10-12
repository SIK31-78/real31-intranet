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

/**
 * Tri des e-mails V2 (ADR-046) : l'adresse de la boite generique a trier, ou null si le
 * module n'est pas configure (il reste alors invisible). "echantillon" = mails fictifs.
 */
export function boiteTriConfiguree(): string | null {
  const brut = (process.env.MAIL_BOITE_TRI ?? "").trim().toLowerCase();
  return brut || null;
}

/**
 * Écran « Échanges » : les boîtes communes de chaque agence, ex. « HLS=syndic4@real31.fr ».
 * Une agence absente n'a pas l'écran (ouverture à Houilles seulement, décision du 12/10).
 */
export function boitesParAgenceBrut(): string {
  return process.env.MAIL_BOITES_AGENCE ?? "";
}

/**
 * Mise en service du tri : seuls les mails recus a partir de MAIL_TRI_DEPUIS (AAAA-MM-JJ,
 * minuit heure de Paris) entrent dans la file. Le stock d'avant reste ou il est (syndic4 :
 * 18 233 mails en reception le 12/10/2026). Absente ou illisible = toute la reception.
 */
export function debutTri(): string | null {
  const brut = (process.env.MAIL_TRI_DEPUIS ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(brut);
  if (!m) return null;
  // Minuit a Paris : UTC+2 l'ete, UTC+1 l'hiver. On calcule le decalage du jour vise.
  const midiUtc = new Date(`${brut}T12:00:00Z`);
  const heureParis = Number(midiUtc.toLocaleString("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }));
  const decalage = heureParis - 12;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), -decalage)).toISOString().replace(".000Z", "Z");
}

/**
 * Le tri ECRIT-il vraiment dans la boite (creer un dossier, deplacer un mail) ? Seulement
 * si MAIL_TRI_ECRITURE=on. Sinon tout rangement est simule et journalise comme tel : la
 * regle est qu'aucun vrai mail ne bouge sans l'accord de Sekou (ADR-046).
 */
export function ecritureTriActive(): boolean {
  return (process.env.MAIL_TRI_ECRITURE ?? "").trim().toLowerCase() === "on";
}
