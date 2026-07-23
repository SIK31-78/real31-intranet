// Squelette pendant le chargement de l'accueil (AG de la semaine + dossiers en cours).

import { SkeletonListe, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8 flex flex-col gap-8">
      <Skeleton className="h-7 w-72" />
      <SkeletonListe lignes={3} />
      <SkeletonListe lignes={5} />
    </div>
  );
}
