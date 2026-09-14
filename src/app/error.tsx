"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

// Frontiere d'erreur : evite l'ecran blanc si une page plante (ex. Supabase indispo),
// et remonte l'erreur a Sentry - sinon le collegue voit « Reessayer » et nous, rien.

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-2">
      <div className="text-center max-w-md">
        <h1 className="text-title font-medium text-ink">Une erreur est survenue</h1>
        <p className="text-body text-ink-3 mt-2">
          Le service est momentanément indisponible. Réessaie dans un instant.
        </p>
        <Button
          onClick={reset}
          variant="primary" size="lg" className="mt-4"
        >
          Réessayer
        </Button>
      </div>
    </div>
  );
}
