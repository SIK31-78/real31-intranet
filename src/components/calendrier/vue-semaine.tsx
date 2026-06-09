import { cn } from "@/lib/cn";
import { JOURS_COURT, type SemaineGrille } from "@/lib/domain/calendrier-grille";
import { indexerParDate, type Evenement } from "@/lib/domain/calendrier";
import { EvenementChip } from "./evenement-chip";

export function VueSemaine({
  grille,
  evenements,
}: {
  grille: SemaineGrille;
  evenements: Evenement[];
}) {
  const index = indexerParDate(evenements);
  return (
    <div className="bg-surface border border-line rounded-md overflow-hidden grid grid-cols-7">
      {grille.jours.map((j, ji) => {
        const evs = index.get(j.date) ?? [];
        const dernierCol = ji === 6;
        return (
          <div
            key={j.date}
            className={cn(
              "min-h-[360px] flex flex-col border-r border-line",
              dernierCol && "border-r-0",
            )}
          >
            <div
              className={cn(
                "px-2.5 py-2 border-b border-line flex items-baseline gap-1.5",
                j.estAujourdhui && "bg-green-50",
              )}
            >
              <span
                className={cn(
                  "text-[10.5px] font-medium uppercase tracking-[0.08em]",
                  j.estAujourdhui ? "text-green-700" : "text-ink-3",
                )}
              >
                {JOURS_COURT[ji]}
              </span>
              <span
                className={cn(
                  "text-[16px] leading-none",
                  j.estAujourdhui ? "text-green-700 font-medium" : "text-ink",
                )}
              >
                {j.numero}
              </span>
            </div>
            <div className="p-2 flex flex-col gap-1.5 flex-1">
              {evs.length === 0 && (
                <span className="text-[12px] text-ink-4 pl-1 pt-1">-</span>
              )}
              {evs.map((e) => (
                <EvenementChip key={e.id} evenement={e} taille="md" />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
