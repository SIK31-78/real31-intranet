// Primitive de chargement (placeholder anime). Decorative -> aria-hidden.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-surface-2 ${className}`} />;
}

/** Liste de lignes (ex : liste de copros, file compta) en chargement. */
export function SkeletonListe({ lignes = 6 }: { lignes?: number }) {
  return (
    <div className="border border-line rounded-lg bg-surface divide-y divide-line" aria-hidden="true">
      {Array.from({ length: lignes }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-5 w-14 shrink-0" />
          <Skeleton className="h-4 flex-1 max-w-[260px]" />
          <Skeleton className="h-4 w-16 ml-auto" />
        </div>
      ))}
    </div>
  );
}
