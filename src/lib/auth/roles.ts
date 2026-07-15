// Roles transverses de l'intranet, definis par allowlist d'emails dans l'env (CSV),
// meme pattern que SUPER_ADMINS / MAIL_PILOTES. Module PUR (aucune dependance next-auth)
// -> testable offline et reutilisable cote session, AppShell et pages.
//
// COMPTABLES : le pole comptable du cabinet (Elsa, Romain, Isabelle). Transverse : PAS
// gestionnaires (pas de portefeuille managerId), ils voient TOUTES les copros via le
// dashboard /comptabilite. Les emails sont poses par Sekou dans l'env (aucun en dur ici).

/** Emails d'une allowlist CSV, normalises (trim + minuscules). */
function allowlist(csv: string | undefined): string[] {
  return (csv ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function dans(email: string | null | undefined, csv: string | undefined): boolean {
  return Boolean(email && allowlist(csv).includes(email.toLowerCase()));
}

/** L'email est-il celui d'un membre du pole comptable (allowlist COMPTABLES) ? */
export function estComptable(email: string | null | undefined): boolean {
  return dans(email, process.env.COMPTABLES);
}

/**
 * Acces au dashboard comptable (/comptabilite) : le pole compta (COMPTABLES) et les
 * super-admins (SUPER_ADMINS, pour tester). Un gestionnaire normal n'y a pas acces.
 */
export function peutVoirComptabilite(email: string | null | undefined): boolean {
  return estComptable(email) || dans(email, process.env.SUPER_ADMINS);
}
