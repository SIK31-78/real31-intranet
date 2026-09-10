import { grouperParJour, type Evenement } from "@/lib/domain/calendrier";
import { libelleJourLong } from "@/lib/domain/calendrier-grille";
import { EvenementChip } from "./evenement-chip";
import { EmptyState } from "@/components/ui/empty-state";

export function VueListe({ evenements }: { evenements: Evenement[] }) {
  const jours = grouperParJour(evenements);
  if (jours.length === 0) {
    return (
      <EmptyState>Aucun événement sur la période</EmptyState>
    );
  }
  return (
    <div className="bg-surface border border-line rounded-lg shadow-1 divide-y divide-line">
      {jours.map((j) => (
        <div key={j.date} className="flex gap-4 px-4 py-3">
          <div className="w-[100px] sm:w-[180px] shrink-0 pt-1">
            <div className="text-body font-medium text-ink">
              {libelleJourLong(j.date)}
            </div>
            <div className="text-meta text-ink-2 tabular-nums">{j.date.split("-").reverse().join("/")}</div>
          </div>
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            {j.evenements.map((e) => (
              <EvenementChip key={e.id} evenement={e} taille="md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
