import Link from "next/link";
import { Route } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ETAT_CYCLE_LABEL } from "@/lib/domain/etat-cycle-ag";
import type { PipelineEtat } from "@/lib/domain/dashboard";

// Pipeline des AG : la vue d'ensemble du portefeuille par etat du cycle (cockpit).
// Chaque colonne renvoie vers la liste filtree sur cet etat.
export function PipelineAg({ pipeline }: { pipeline: PipelineEtat[] }) {
  const total = pipeline.reduce((s, p) => s + p.count, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Route strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Pipeline des AG
        </CardTitle>
        <span className="text-[12px] text-ink-3">{total} copropriété{total > 1 ? "s" : ""}</span>
      </CardHeader>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-line border-line [&>*]:border-b [&>*]:border-r">
        {pipeline.map((p) => (
          <Link
            key={p.etat}
            href={`/copropriete?etat=${p.etat}`}
            className="px-4 py-4 hover:bg-surface-2 transition-colors duration-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset"
          >
            <div className="text-[11px] uppercase tracking-[0.5px] text-ink-3">
              {ETAT_CYCLE_LABEL[p.etat]}
            </div>
            <div className="mt-1 text-[26px] font-medium leading-none text-ink">{p.count}</div>
            {p.enRetard > 0 && (
              <div className="mt-1.5 text-[11px] font-medium text-err-700">{p.enRetard} en retard</div>
            )}
          </Link>
        ))}
      </div>
    </Card>
  );
}
