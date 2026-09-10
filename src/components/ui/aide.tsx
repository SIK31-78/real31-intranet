import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";

// Aide contextuelle REPLIEE par defaut. Remplace les paragraphes explicatifs sous les
// titres et les bandeaux d'aide permanents : l'information reste accessible, elle ne
// prend plus la place des donnees. <details> natif = zero etat, rendu serveur, clavier ok.

export function Aide({ titre = "Comment ça marche", children }: { titre?: string; children: ReactNode }) {
  return (
    <details className="group text-body">
      <summary className="inline-flex items-center gap-1.5 cursor-pointer select-none text-ink-2 hover:text-ink transition-colors duration-120 [&::-webkit-details-marker]:hidden list-none focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded-sm">
        <CircleHelp strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {titre}
      </summary>
      <div className="mt-2 max-w-[64ch] text-ink-2 group-open:animate-fade-in [&_a]:underline [&_a]:underline-offset-2 [&_a]:text-ink [&_p+p]:mt-1.5">
        {children}
      </div>
    </details>
  );
}
