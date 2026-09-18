import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

// Une Section qu'on replie : meme titre, meme compteur, un chevron. <details> natif,
// zero JS, fermee par defaut. Pour ce qu'on consulte rarement (journal, historique).

export function SectionRepliable({
  id,
  titre,
  compte,
  ouverte = false,
  resume,
  children,
  className,
}: {
  id: string;
  titre: ReactNode;
  compte?: number;
  ouverte?: boolean;
  /** Une ligne affichee a droite du titre quand la section est repliee. */
  resume?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details id={id} open={ouverte} className={cn("group flex flex-col gap-2.5", className)}>
      <summary className="flex cursor-pointer select-none items-center justify-between gap-4 min-h-7 list-none [&::-webkit-details-marker]:hidden rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
        <span className="flex items-baseline gap-2 text-title font-semibold tracking-tight text-ink">
          <ChevronRight strokeWidth={1.5} className="w-4 h-4 self-center text-ink-3 transition-transform duration-120 group-open:rotate-90" aria-hidden />
          {titre}
          {compte !== undefined && <span className="text-body font-normal text-ink-2 tabular-nums">{compte}</span>}
        </span>
        {resume && <span className="text-body text-ink-2 group-open:hidden">{resume}</span>}
      </summary>
      <div className="mt-2.5">{children}</div>
    </details>
  );
}
