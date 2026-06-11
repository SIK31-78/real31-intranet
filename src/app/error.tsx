"use client";

// Frontiere d'erreur : evite l'ecran blanc si une page plante (ex. Supabase indispo).

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-2">
      <div className="text-center max-w-md">
        <h1 className="text-[18px] font-medium text-ink">Une erreur est survenue</h1>
        <p className="text-[13px] text-ink-3 mt-2">
          Le service est momentanément indisponible. Réessaie dans un instant.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 h-9 px-4 rounded-md bg-green-700 text-surface text-[13px] font-medium hover:bg-green-600"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
