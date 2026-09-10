import { cn } from "@/lib/cn";

// Barre de progression 6 px. Le vert ici = "complete", c'est la seule exception
// tolérée au vert-action (une checklist finie est l'objectif de l'ecran).

export function Progress({
  valeur,
  label,
  className,
}: {
  /** 0..100 */
  valeur: number;
  /** Libelle accessible ("Progression : 74 %"). */
  label: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(valeur)));
  return (
    <div
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-1.5 w-full rounded-full bg-surface-2 overflow-hidden", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-240 ease-out-quart", v === 100 ? "bg-ok-500" : "bg-green-700")}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
