import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Rows } from "@/components/ui/list-rows";
import type { ProblemesCopro } from "@/lib/domain/supervision-ag";

// "Points signales" : les items de supervision coches "probleme", groupes par copro
// (decision Sekou). Chaque ligne renvoie a la supervision concernee ; le probleme
// disparait quand on re-coche OK la-bas. Le titre est porte par la Section de la page ;
// l'appelant ne rend le panneau que s'il y a au moins un probleme.
export function ProblemesPanel({ problemes }: { problemes: ProblemesCopro[] }) {
  if (problemes.length === 0) return null;
  return (
    <Rows>
      {problemes.map((grp) => (
        <li key={grp.coproCode} className="px-4 py-2 text-body">
          <div className="flex items-baseline gap-2 min-h-7">
            <span className="font-mono text-ink-2">{grp.coproCode}</span>
            <span className="font-medium text-ink truncate">{grp.coproNom}</span>
          </div>
          <ul className="flex flex-col">
            {grp.items.map((it, i) => (
              <li key={i}>
                <Link
                  href={`/supervision-ag/${it.agId}`}
                  className="flex items-start gap-2 rounded-sm px-1.5 py-1 -mx-1.5 hover:bg-surface-2 transition-colors duration-120 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-err-500 mt-0.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  <span className="min-w-0">
                    <span className="text-ink">{it.itemLibelle}</span>
                    {it.commentaire && <span className="text-ink-2"> — {it.commentaire}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </Rows>
  );
}
