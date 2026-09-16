// Sentry cote SERVEUR (Node : pages server, Server Actions, routes API). Charge par
// src/instrumentation.ts. Sans DSN (dev local) : no-op.
import * as Sentry from "@sentry/nextjs";

// Le token de la fiche coproprietaire (256 bits, ouvre des PII) vit dans l'URL /fiche/<token> :
// il ne part jamais chez Sentry (audit du 16/09/2026).
const FICHE_RE = /\/fiche\/[^/?#\s]+/g;
function expurgerFiche(event: Sentry.ErrorEvent): void {
  const nettoyer = (s: string) => s.replace(FICHE_RE, "/fiche/[token]");
  if (event.request?.url) event.request.url = nettoyer(event.request.url);
  if (event.transaction) event.transaction = nettoyer(event.transaction);
  for (const b of event.breadcrumbs ?? []) {
    if (b.message) b.message = nettoyer(b.message);
    for (const k of ["url", "to", "from"]) {
      const v = b.data?.[k];
      if (typeof v === "string" && b.data) b.data[k] = nettoyer(v);
    }
  }
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // Traces de performance : un echantillon suffit (on cherche les erreurs, pas le profil).
  tracesSampleRate: 0.1,
  // PII : jamais les en-tetes/cookies/IP par defaut. Les emails des coproprietaires
  // transitent dans certaines Server Actions - on ne veut rien de tout ca chez Sentry.
  sendDefaultPii: false,
  beforeSend(event) {
    expurgerFiche(event);
    // Ceinture et bretelles : un email qui aurait fui dans un message est masque.
    const masquer = (s: string | undefined) => s?.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
    if (event.message) event.message = masquer(event.message);
    for (const ex of event.exception?.values ?? []) ex.value = masquer(ex.value);
    delete event.request?.cookies;
    delete event.request?.headers;
    return event;
  },
});
