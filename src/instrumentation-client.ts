// Sentry cote NAVIGATEUR (Next 16 : ce fichier remplace sentry.client.config). Sans DSN : no-op.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
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
    const masquer = (s: string | undefined) => s?.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
    if (event.message) event.message = masquer(event.message);
    for (const ex of event.exception?.values ?? []) ex.value = masquer(ex.value);
    return event;
  },
});

// Navigation App Router : Sentry relie les erreurs a la page courante.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
