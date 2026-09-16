// « Aujourd'hui » pour les pages : la date du jour A PARIS, pas en UTC. Avant l'audit du
// 16/09/2026, quatorze pages faisaient `new Date().toISOString().slice(0, 10)` : entre
// minuit et 2 h, les retards, alertes de mandat et retroplannings basculaient d'un jour.

const PARIS = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/** Ancre des donnees mockees (COPRO_SOURCE != supabase) : les jeux de demo sont cales dessus. */
export const ANCRE_MOCK = "2026-05-27";

/** « AAAA-MM-JJ » du jour, heure de Paris. */
export function jourParis(instant: Date = new Date()): string {
  return PARIS.format(instant);
}

/** Le « aujourd'hui » d'une page : le vrai jour sur la vraie data, l'ancre des mocks sinon. */
export function ancreDuJour(): string {
  return process.env.COPRO_SOURCE === "supabase" ? jourParis() : ANCRE_MOCK;
}
