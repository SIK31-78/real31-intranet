"use client";

import { Button } from "@/components/ui/button";

// Frontiere d'erreur : evite l'ecran blanc si une page plante (ex. Supabase indispo).

export default function Error({ reset }: { error: Error; reset: () => void }) {
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
