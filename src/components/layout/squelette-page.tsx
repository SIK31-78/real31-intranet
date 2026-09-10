import { Skeleton, SkeletonListe } from "@/components/ui/skeleton";

// Ecran de chargement d'une page (loading.tsx) : on garde le CADRE du shell - le
// rail sombre a gauche, le papier a droite - pour que la navigation ne "clignote"
// pas (retour Sekou 2026-09-10 : le squelette plein ecran sans rail faisait
// disparaitre toute l'app entre deux pages). Le rail est ici un aplat muet : le
// vrai rail (session, nav active) arrive avec la page.
export function SquelettePage({
  largeur = "travail",
  titre = true,
  listes = [6],
}: {
  largeur?: "lecture" | "travail";
  /** Une barre de titre en tete. */
  titre?: boolean;
  /** Une liste squelette par entree, avec son nombre de lignes. */
  listes?: number[];
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:block shrink-0 w-60 bg-rail" aria-hidden />
      <div className="md:hidden h-12 bg-rail" aria-hidden />
      <main className="flex-1 min-w-0">
        <div
          className={`mx-auto w-full px-4 py-5 sm:px-6 md:px-8 md:py-6 flex flex-col gap-5 ${largeur === "lecture" ? "max-w-[900px]" : "max-w-[1200px]"}`}
        >
          <Skeleton className="h-4 w-32" />
          {titre && <Skeleton className="h-7 w-72" />}
          {listes.map((n, i) => (
            <SkeletonListe key={i} lignes={n} />
          ))}
        </div>
      </main>
    </div>
  );
}
