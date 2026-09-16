import { formatDateLongue } from "@/lib/format-date";

// Le journal d'une fiche (perte, proposition…) : la meme chronologie inversee partout,
// date, qui, quoi. Audit du 16/09/2026 : deux copies qui divergeaient.

export interface EntreeJournal {
  quandISO: string;
  par: string;
  texte: string;
}

export function Journal({ entrees }: { entrees: EntreeJournal[] }) {
  if (entrees.length === 0) return <p className="text-body text-ink-3">Aucune entrée pour le moment.</p>;
  return (
    <ul className="flex flex-col gap-1.5 text-body">
      {[...entrees].reverse().map((j, i) => (
        <li key={`${j.quandISO}-${i}`} className="grid grid-cols-[7.5rem_1fr] gap-3 sm:grid-cols-[7.5rem_10rem_1fr]">
          <span className="text-ink-3 tabular-nums">{formatDateLongue(j.quandISO.slice(0, 10))}</span>
          <span className="text-ink-2 truncate hidden sm:block" title={j.par}>{j.par}</span>
          <span className="min-w-0">{j.texte}</span>
        </li>
      ))}
    </ul>
  );
}
