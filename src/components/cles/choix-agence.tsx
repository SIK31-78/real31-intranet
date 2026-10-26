import Link from "next/link";
import { cn } from "@/lib/cn";
import { LIBELLE_AGENCE_CLES } from "@/lib/domain/cles/types";

// Le choix d'agence du comptoir, pour qui a acces a plusieurs agences (direction, delegation,
// direction d'une activite). Des liens, pas un etat client : l'agence vit dans l'URL
// (?agence=HLS), le rendu reste serveur. Meme dessin que SegmentedControl (filtre neutre).

export function ChoixAgenceCles({ agences, active }: { agences: string[]; active?: string }) {
  if (agences.length < 2) return null;
  return (
    <nav aria-label="Agence affichée" className="inline-flex items-center rounded-md border border-line bg-surface-2 p-0.5">
      {agences.map((a) => {
        const actif = a === active;
        return (
          <Link
            key={a}
            href={`/cles?agence=${a}`}
            aria-current={actif ? "page" : undefined}
            className={cn(
              "inline-flex items-center justify-center h-7 px-2.5 rounded-sm border border-transparent text-body font-medium leading-none whitespace-nowrap",
              "transition-colors duration-120 ease-out-quart focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600",
              actif ? "bg-surface text-ink shadow-1" : "text-ink-2 hover:text-ink",
            )}
          >
            {LIBELLE_AGENCE_CLES[a] ?? a}
          </Link>
        );
      })}
    </nav>
  );
}
