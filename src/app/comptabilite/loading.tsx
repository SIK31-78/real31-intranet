// Squelette pendant le chargement de la comptabilite (file des AG a verifier).

import { SkeletonListe, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <Skeleton className="h-5 w-52 mb-4" />
      <SkeletonListe lignes={8} />
    </div>
  );
}
