// Primitive de chargement (placeholder anime). Decorative -> aria-hidden.
// Meme rayon que Card (rounded-lg) : le squelette ne "saute" pas au chargement.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-sm bg-surface-2 ${className}`} />;
}

/** Liste de lignes (ex : liste de copros, file compta) en chargement. */
export function SkeletonListe({ lignes = 6 }: { lignes?: number }) {
  return (
    <div className="border border-line rounded-lg bg-surface shadow-1 divide-y divide-line" aria-hidden="true">
      {Array.from({ length: lignes }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 h-9">
          <Skeleton className="h-4 w-14 shrink-0" />
          <Skeleton className="h-4 flex-1 max-w-[260px]" />
          <Skeleton className="h-4 w-16 ml-auto" />
        </div>
      ))}
    </div>
  );
}

/** Tableau en chargement : un en-tete gris + des lignes. */
export function SkeletonTable({ lignes = 6, colonnes = 4 }: { lignes?: number; colonnes?: number }) {
  return (
    <div className="border border-line rounded-lg bg-surface shadow-1 overflow-hidden" aria-hidden="true">
      <div className="flex items-center gap-3 px-4 h-8 bg-surface-2 border-b border-line">
        {Array.from({ length: colonnes }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-20 bg-line" />
        ))}
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: lignes }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 h-9">
            {Array.from({ length: colonnes }).map((_, j) => (
              <Skeleton key={j} className={j === 0 ? "h-4 w-14" : "h-4 flex-1 max-w-[180px]"} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
