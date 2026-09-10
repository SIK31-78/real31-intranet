"use client";

// Fil d'Ariane de la page courante ("Coproprietes - SE999"), publie par AppShell et
// rendu par <Page> en eyebrow au-dessus du contenu. Depuis la fusion de la topbar
// dans le rail (peau, 2026-09-10) il n'a plus de barre a lui : il vit dans la page.

import { createContext, useContext, type ReactNode } from "react";

const FilArianeCtx = createContext<string | null>(null);

export function FilArianeProvider({ valeur, children }: { valeur: string | null; children: ReactNode }) {
  return <FilArianeCtx.Provider value={valeur}>{children}</FilArianeCtx.Provider>;
}

/** Le fil d'Ariane, rendu en eyebrow ("REAL31 / Coproprietes - SE999"). Rien si absent. */
export function FilAriane() {
  const valeur = useContext(FilArianeCtx);
  if (!valeur) return null;
  return (
    <p className="text-meta text-ink-2 flex items-center gap-1.5 min-h-5">
      <span className="font-medium text-ink-3">REAL31</span>
      <span className="text-ink-3" aria-hidden>/</span>
      <span className="truncate">{valeur}</span>
    </p>
  );
}
