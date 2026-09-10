import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { ETAT_CYCLE_LABEL } from "@/lib/domain/etat-cycle-ag";
import type { PipelineEtat } from "@/lib/domain/dashboard";

// Pipeline des AG : la vue d'ensemble du portefeuille par etat du cycle. Cinq chiffres
// cles sur une ligne ; chaque colonne renvoie vers la liste filtree sur cet etat.
export function PipelineAg({ pipeline }: { pipeline: PipelineEtat[] }) {
  return (
    <Card>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-line">
        {pipeline.map((p) => (
          <Link
            key={p.etat}
            href={`/copropriete?etat=${p.etat}`}
            className="px-4 py-3 hover:bg-surface-2 transition-colors duration-120 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset"
          >
            <Stat
              label={ETAT_CYCLE_LABEL[p.etat]}
              valeur={p.count}
              note={p.enRetard > 0 ? `${p.enRetard} en retard` : undefined}
              ton="err"
            />
          </Link>
        ))}
      </div>
    </Card>
  );
}
