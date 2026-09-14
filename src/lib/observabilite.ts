// Observabilite (ADR-020) : Sentry, et UNIQUEMENT ce qui sert a voir ce que les collegues
// subissent sans le dire.
//
// Deux voies :
//   - les EXCEPTIONS remontent toutes seules (instrumentation.ts, error.tsx, global-error) ;
//   - les ERREURS METIER que le code AVALE proprement (« Oupss » ESTALE rendu en { ok:false },
//     facture Pennylane refusee, Graph muet...) doivent etre SIGNALEES ici, sinon Sentry ne
//     les voit jamais - et c'est precisement celles-la qui nous manquent.
//
// PII : jamais de nom, d'email ou d'adresse de coproprietaire dans un signalement. Les
// contextes passent par `expurger` (emails masques, chaines longues tronquees). L'utilisateur
// attache a l'evenement est un COLLABORATEUR (id technique + initiales), jamais un tiers.
//
// Sans NEXT_PUBLIC_SENTRY_DSN (dev local), tout est un no-op silencieux.

import * as Sentry from "@sentry/nextjs";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LONGUEUR_MAX = 300;

/** Masque les emails et tronque : ce qui part vers Sentry ne doit jamais nommer un tiers. */
export function expurger(valeur: unknown): unknown {
  if (typeof valeur === "string") {
    const sans = valeur.replace(EMAIL_RE, "[email]");
    return sans.length > LONGUEUR_MAX ? sans.slice(0, LONGUEUR_MAX) + "…" : sans;
  }
  if (Array.isArray(valeur)) return valeur.slice(0, 20).map(expurger);
  if (valeur && typeof valeur === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valeur as Record<string, unknown>)) out[k] = expurger(v);
    return out;
  }
  return valeur;
}

export type ContexteSignalement = {
  /** Sous-systeme fautif : "estale", "pennylane", "graph", "supabase", "reprise"... (tag Sentry). */
  source: string;
  /** Code court de la copro concernee s'il y en a une (tag, pas de PII). */
  copro?: string;
  /** Tout detail utile au diagnostic ; expurge avant envoi. */
  detail?: Record<string, unknown>;
};

/**
 * Signale une erreur METIER a Sentry (niveau warning) : le code a gere le cas, l'utilisateur
 * a eu un message propre, mais on veut savoir que ca arrive, combien de fois et sur quoi.
 */
export function signaler(message: string, ctx: ContexteSignalement): void {
  Sentry.withScope((scope) => {
    scope.setTag("source", ctx.source);
    if (ctx.copro) scope.setTag("copro", ctx.copro);
    if (ctx.detail) scope.setContext("detail", expurger(ctx.detail) as Record<string, unknown>);
    scope.setLevel("warning");
    Sentry.captureMessage(String(expurger(message)));
  });
}

/**
 * Signale une EXCEPTION rattrapee par le code (catch qui rend { ok:false }) : meme intention
 * que `signaler`, mais avec la pile.
 */
export function signalerException(err: unknown, ctx: ContexteSignalement): void {
  Sentry.withScope((scope) => {
    scope.setTag("source", ctx.source);
    if (ctx.copro) scope.setTag("copro", ctx.copro);
    if (ctx.detail) scope.setContext("detail", expurger(ctx.detail) as Record<string, unknown>);
    Sentry.captureException(err);
  });
}

/** Attache le collaborateur connecte a l'evenement (id technique + initiales, rien d'autre). */
export function attacherUtilisateur(u: { id: string; initiales: string } | null): void {
  Sentry.setUser(u ? { id: u.id, username: u.initiales } : null);
}
