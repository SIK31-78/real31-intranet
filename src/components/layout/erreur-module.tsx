"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button, ButtonLink } from "@/components/ui/button";

// Frontiere d'erreur d'un MODULE (error.tsx d'un segment) : la page a plante, on le dit avec
// le nom du module et un chemin de sortie, plutot que l'ecran generique de la racine. L'erreur
// part a Sentry avec son digest (audit du 16/09/2026 : un seul error.tsx pour 47 pages).

export function ErreurModule({
  module,
  retourHref,
  retourLibelle,
  error,
  reset,
}: {
  module: string;
  retourHref: string;
  retourLibelle: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { module } });
  }, [error, module]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="text-meta text-ink-3 uppercase tracking-wide">{module}</p>
        <h1 className="text-title font-medium text-ink mt-1">Cette page n&apos;a pas pu s&apos;afficher</h1>
        <p className="text-body text-ink-3 mt-2">
          L&apos;incident est signalé{error.digest ? ` (réf. ${error.digest})` : ""}. Réessaie, ou reviens à la liste.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button onClick={reset} variant="primary">Réessayer</Button>
          <ButtonLink href={retourHref} variant="secondary">{retourLibelle}</ButtonLink>
        </div>
      </div>
    </div>
  );
}
