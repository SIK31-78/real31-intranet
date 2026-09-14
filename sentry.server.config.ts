// Sentry cote SERVEUR (Node : pages server, Server Actions, routes API). Charge par
// src/instrumentation.ts. Sans DSN (dev local) : no-op.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // Traces de performance : un echantillon suffit (on cherche les erreurs, pas le profil).
  tracesSampleRate: 0.1,
  // PII : jamais les en-tetes/cookies/IP par defaut. Les emails des coproprietaires
  // transitent dans certaines Server Actions - on ne veut rien de tout ca chez Sentry.
  sendDefaultPii: false,
  beforeSend(event) {
    // Ceinture et bretelles : un email qui aurait fui dans un message est masque.
    const masquer = (s: string | undefined) => s?.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
    if (event.message) event.message = masquer(event.message);
    for (const ex of event.exception?.values ?? []) ex.value = masquer(ex.value);
    delete event.request?.cookies;
    delete event.request?.headers;
    return event;
  },
});
