// Validation des collaborateurs (collegues) associes a une reunion AG / CS. Logique
// PURE (domaine, ADR-001) : aucune dependance technique, testable offline. L'anti-
// injection vit ICI : on ne garde QUE des emails presents dans la liste FERMEE des
// gestionnaires connus (relue cote serveur), l'organisateur exclu, la casse normalisee
// sur la valeur canonique de la liste, les doublons ecartes. Un email hors liste rend
// tout le lot invalide (on ne devine jamais un invite : demande explicite ou rien).

/** Resultat : la liste canonique validee, ou un marqueur d'invalidite (email inconnu). */
export type CollaborateursValides = { emails: string[] } | { invalide: true };

/**
 * Filtre `demandes` (emails venus du client, jamais de confiance) contre `emailsConnus`
 * (emails des gestionnaires du cabinet). Renvoie les emails CANONIQUES (casse de la
 * liste connue), sans `selfEmail` (l'organisateur ne s'invite pas) et dedoublonnes.
 * Un email demande absent de la liste connue -> `{ invalide: true }` (anti-injection).
 * Liste vide -> `{ emails: [] }`.
 */
export function validerCollaborateursConnus(
  demandes: string[],
  emailsConnus: string[],
  selfEmail: string | undefined,
): CollaborateursValides {
  const parEmail = new Map(
    emailsConnus
      .filter((e) => e && e.trim().length > 0)
      .map((e) => [e.toLowerCase(), e] as const),
  );
  const self = (selfEmail ?? "").trim().toLowerCase();
  const vus = new Set<string>();
  const emails: string[] = [];
  for (const brut of demandes) {
    const cle = brut.trim().toLowerCase();
    if (!cle || cle === self) continue; // organisateur : jamais dans ses propres invites
    const canon = parEmail.get(cle);
    if (!canon) return { invalide: true }; // email inconnu -> on refuse tout le lot
    if (vus.has(cle)) continue;
    vus.add(cle);
    emails.push(canon);
  }
  return { emails };
}
