import { prochainsEvenements, type Evenement } from "@/lib/domain/calendrier";
import { libelleJourLong } from "@/lib/domain/calendrier-grille";
import { EvenementChip } from "./evenement-chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { EmptyState } from "@/components/ui/empty-state";

const N = 6;

export function AgendaProchains({
  evenements,
  aujourdhuiISO,
}: {
  evenements: Evenement[];
  aujourdhuiISO: string;
}) {
  const prochains = prochainsEvenements(evenements, aujourdhuiISO, N);
  return (
    <aside className="bg-surface border border-line rounded-md p-4 w-full lg:w-[300px] shrink-0 self-start">
      <Eyebrow className="mb-3">Prochains événements</Eyebrow>
      {prochains.length === 0 ? (
        <EmptyState compact>Aucun événement à venir</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {prochains.map((e) => (
            <div key={e.id} className="flex flex-col gap-1">
              <div className="text-meta text-ink-2">
                {libelleJourLong(e.date)}
                {e.heure && ` · ${e.heure}`}
              </div>
              <EvenementChip evenement={e} taille="md" />
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
