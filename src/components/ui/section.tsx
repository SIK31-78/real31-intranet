import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Section de page : un titre, un compteur, une action a droite. PAS de sous-titre
// explicatif (ce qui aide va dans <Aide>, le reste n'est pas ecrit).

export function Section({
  id,
  titre,
  compte,
  actions,
  children,
  className,
}: {
  id: string;
  titre: ReactNode;
  /** Nombre d'elements, affiche a cote du titre. */
  compte?: number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const titreId = `${id}-titre`;
  return (
    <section aria-labelledby={titreId} className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-center justify-between gap-4 min-h-7">
        <h2 id={titreId} className="flex items-baseline gap-2 text-title font-semibold tracking-tight text-ink">
          {titre}
          {compte !== undefined && (
            <span className="text-body font-normal text-ink-2 tabular-nums">{compte}</span>
          )}
        </h2>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
