// Sentry cote NAVIGATEUR (Next 16 : ce fichier remplace sentry.client.config). Sans DSN : no-op.
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
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  // Tunnel MAISON : les enveloppes passent par notre domaine (bloqueurs de pub) et ne
  // sont relayees que vers notre projet (src/app/monitoring/route.ts).
  tunnel: "/monitoring",
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  // Session Replay : on n'enregistre RIEN en temps normal, et les 30 s qui precedent une
  // erreur quand il y en a une - avec tout le texte masque (ecrans pleins de noms de
  // coproprietaires, de montants, d'adresses). On voit le geste, pas la donnee.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true, maskAllInputs: true }),
  ],
  beforeSend(event) {
    expurgerFiche(event);
    const masquer = (s: string | undefined) => s?.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
    if (event.message) event.message = masquer(event.message);
    for (const ex of event.exception?.values ?? []) ex.value = masquer(ex.value);
    return event;
  },
});

// Navigation App Router : Sentry relie les erreurs a la page courante.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
