import { phaseRank } from '@/lib/domain/sinistre/engine/phases';
import type { DecisionNode } from '@/lib/domain/sinistre/types';

const RAILS: { rank: number; label: string }[] = [
  { rank: 0, label: 'Urgence' },
  { rank: 1, label: 'Qualification' },
  { rank: 2, label: 'Gestionnaire' },
  { rank: 3, label: 'Recherche de fuite' },
  { rank: 4, label: 'Tranche' },
  { rank: 5, label: 'Prise en charge' },
  { rank: 8, label: 'CIDECOP' },
];

export function Breadcrumb({ node }: { node: DecisionNode }) {
  const rank = phaseRank(node);
  const sortie = rank === null;

  return (
    <ol className="no-print mb-4 flex flex-wrap items-center gap-1 text-xs">
      {RAILS.map((r) => {
        const active = rank !== null && r.rank === (rank >= 5 && rank <= 7 ? 5 : rank);
        const done = rank !== null && (rank >= 5 && rank <= 7 ? 5 : rank) > r.rank;
        return (
          <li key={r.rank} className="flex items-center gap-1">
            <span
              className={`rounded-full px-2.5 py-0.5 ${
                active
                  ? 'bg-green-700 font-medium text-white'
                  : done
                    ? 'bg-green-50 text-green-700'
                    : 'bg-surface-2 text-ink-3'
              }`}
            >
              {r.label}
            </span>
            <span aria-hidden className="text-line-2">›</span>
          </li>
        );
      })}
      <li>
        <span
          className={`rounded-full px-2.5 py-0.5 ${
            sortie ? 'bg-green-700 font-medium text-white' : 'bg-surface-2 text-ink-3'
          }`}
        >
          Synthèse
        </span>
      </li>
    </ol>
  );
}
