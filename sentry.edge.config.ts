// Sentry cote EDGE (proxy.ts). Meme reglage que le serveur, sans replay ni traces lourdes.
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
  tracesSampleRate: 0.05,
  sendDefaultPii: false,
  beforeSend(event) {
    expurgerFiche(event);
    delete event.request?.cookies;
    delete event.request?.headers;
    return event;
  },
});
