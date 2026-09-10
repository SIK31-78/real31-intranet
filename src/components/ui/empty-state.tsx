import type { ComponentType, ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/cn";

// Etat vide : une icone, UN mot ou une ligne, une action si elle a un sens. Pas de
// carte autour (le vide n'a pas besoin d'un cadre), pas de phrase de consolation.

type IconeComp = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

export function EmptyState({
  icone: Icone = Inbox,
  action,
  compact = false,
  children,
}: {
  icone?: IconeComp;
  action?: ReactNode;
  /** Version en ligne (dans un bloc lateral) : icone + texte, sans hauteur. */
  compact?: boolean;
  children: ReactNode;
}) {
  if (compact) {
    return (
      <p className="flex items-center gap-2 text-body text-ink-2">
        <Icone strokeWidth={1.5} className="w-4 h-4 shrink-0 text-ink-3" aria-hidden />
        <span>{children}</span>
        {action}
      </p>
    );
  }
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-8 text-center text-body text-ink-2")}>
      <Icone strokeWidth={1.5} className="w-5 h-5 text-ink-3" aria-hidden />
      <p>{children}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
