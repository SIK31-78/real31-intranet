// Point d'entree d'instrumentation Next : charge la config Sentry du bon runtime et remonte
// les erreurs des requetes (pages server, Server Actions, routes) - y compris celles que
// l'App Router rattrape lui-meme et transforme en error.tsx.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("../sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("../sentry.edge.config");
}

export const onRequestError = Sentry.captureRequestError;
