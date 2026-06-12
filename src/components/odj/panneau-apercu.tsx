"use client";

import { useState, type ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

// Apercu live du document ODJ : colonne droite sticky, repliable. Le document
// (server-rendered) arrive en children ; il se rafraichit a chaque saisie via
// revalidatePath.

export function PanneauApercu({ children }: { children: ReactNode }) {
  const [ouvert, setOuvert] = useState(true);

  if (!ouvert) {
    return (
      <div className="sticky top-6 shrink-0">
        <button
          type="button"
          onClick={() => setOuvert(true)}
          title="Afficher l'apercu du document"
          className="flex flex-col items-center gap-2 px-2 py-3 rounded-md border border-line bg-surface text-ink-3 hover:text-ink-2 hover:border-line-2 transition-colors"
        >
          <PanelRightOpen strokeWidth={1.5} className="w-4 h-4" />
          <span className="text-[11px] font-medium [writing-mode:vertical-rl]">Aperçu document</span>
        </button>
      </div>
    );
  }

  return (
    <div className="sticky top-6 w-[560px] shrink-0 max-h-[calc(100vh-3rem)] flex flex-col">
      <div className="flex items-center justify-between px-3 h-9 border border-b-0 border-line rounded-t-md bg-surface-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">
          Aperçu du document
        </span>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          title="Replier l'apercu"
          className="text-ink-3 hover:text-ink-2"
        >
          <PanelRightClose strokeWidth={1.5} className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto border border-line rounded-b-md bg-white shadow-sm">
        <div className="px-7 py-7">{children}</div>
      </div>
    </div>
  );
}
