import { prochainsEvenements, type Evenement } from "@/lib/domain/calendrier";
import { libelleJourLong } from "@/lib/domain/calendrier-grille";
import { EvenementChip } from "./evenement-chip";

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
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3 mb-3">
        Prochains événements
      </div>
      {prochains.length === 0 ? (
        <div className="text-[13px] text-ink-3">Aucun événement à venir.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {prochains.map((e) => (
            <div key={e.id} className="flex flex-col gap-1">
              <div className="text-[11.5px] text-ink-3">
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
