"use client";

// Frontiere d'erreur RACINE : quand c'est le layout lui-meme qui plante, error.tsx ne peut
// plus s'afficher. Ce composant remplace tout le document - d'ou <html>/<body> ici - et
// envoie l'erreur a Sentry, sinon un ecran blanc reste invisible pour nous.

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f6f6f4", margin: 0 }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <h1 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>Une erreur est survenue</h1>
            <p style={{ color: "#666", marginTop: 8 }}>
              Le service est momentanément indisponible. L&apos;incident nous a été signalé.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: 0, background: "#1f7a4d", color: "#fff", cursor: "pointer" }}
            >
              Réessayer
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
