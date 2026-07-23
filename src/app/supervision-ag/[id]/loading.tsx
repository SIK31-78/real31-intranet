// Squelette pendant le chargement de la supervision d'une AG (checklist).

import { SkeletonListe, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <Skeleton className="h-5 w-64 mb-4" />
      <SkeletonListe lignes={10} />
    </div>
  );
}
