import { grouperParJour, type Evenement } from "@/lib/domain/calendrier";
import { libelleJourLong } from "@/lib/domain/calendrier-grille";
import { EvenementChip } from "./evenement-chip";

export function VueListe({ evenements }: { evenements: Evenement[] }) {
  const jours = grouperParJour(evenements);
  if (jours.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-md p-8 text-center text-[13px] text-ink-3">
        Aucun événement sur la période.
      </div>
    );
  }
  return (
    <div className="bg-surface border border-line rounded-md divide-y divide-line">
      {jours.map((j) => (
        <div key={j.date} className="flex gap-4 px-4 py-3">
          <div className="w-[100px] sm:w-[180px] shrink-0 pt-1">
            <div className="text-[13px] font-medium text-ink">
              {libelleJourLong(j.date)}
            </div>
            <div className="text-[11px] text-ink-3">{j.date.split("-").reverse().join("/")}</div>
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
