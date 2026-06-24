import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProblemesCopro } from "@/lib/domain/supervision-ag";

// Panneau "Problemes" : les items de supervision coches "probleme", groupes par copro
// (decision Sekou). Remplace "Activite recente". Chaque ligne renvoie a la supervision
// concernee ; le probleme disparait quand on re-coche OK la-bas.
export function ProblemesPanel({ problemes }: { problemes: ProblemesCopro[] }) {
  const total = problemes.reduce((n, g) => n + g.items.length, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Problèmes{total > 0 ? ` (${total})` : ""}</CardTitle>
      </CardHeader>
      <div className="px-4 pb-2">
        {total === 0 ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center gap-2 py-8 text-ink-3"
          >
            <CheckCircle2 className="w-6 h-6 opacity-40" strokeWidth={1.5} aria-hidden={true} />
            <span className="text-[13px]">Aucun problème signalé</span>
          </div>
        ) : (
          problemes.map((grp) => (
            <div key={grp.coproCode} className="py-2 border-b border-line last:border-b-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-[12px] text-ink-2">{grp.coproCode}</span>
                <span className="text-[12.5px] font-medium text-ink truncate">{grp.coproNom}</span>
              </div>
              <ul className="flex flex-col gap-0.5">
                {grp.items.map((it, i) => (
                  <li key={i}>
                    <Link
                      href={`/supervision-ag/${it.agId}`}
                      className="flex items-start gap-2 text-[13px] rounded px-1.5 py-1 -mx-1.5 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset"
                    >
                      <AlertTriangle
                        className="w-3.5 h-3.5 text-err-500 mt-0.5 shrink-0"
                        strokeWidth={1.5}
                        aria-hidden={true}
                      />
                      <span className="min-w-0">
                        <span className="text-ink">{it.itemLibelle}</span>
                        {it.commentaire && <span className="text-ink-3"> - {it.commentaire}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
