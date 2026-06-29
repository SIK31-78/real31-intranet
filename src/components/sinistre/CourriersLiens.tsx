/** Liste « Modèles de mails ou courriers recommandés » réutilisable (D-2/H-2). */

import Link from 'next/link';
import { courriers } from '@/lib/domain/sinistre/data';
import { Button, SectionTitle } from './ui';
import type { CourrierId } from '@/lib/domain/sinistre/types';

export function ListeCourriersLiens({ ids }: { ids: CourrierId[] }) {
  if (ids.length === 0) return null;
  return (
    <div className="mt-6 rounded-lg border border-line bg-surface p-4">
      <SectionTitle>Modèles de mails ou courriers recommandés</SectionTitle>
      <ul className="divide-y divide-surface-2">
        {ids.map((id) => {
          const c = courriers.find((x) => x.id === id);
          if (!c) return null;
          return (
            <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <span className="font-medium text-ink">
                  {c.id} — {c.titre}
                </span>
                <div className="text-xs text-ink-3">
                  {c.destinataire} · {c.mode_envoi} · {c.delai}
                </div>
              </div>
              <Link href={`/sinistre/courriers/${c.id}`}>
                <Button variant="secondary">Générer →</Button>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Courriers dont les déclencheurs incluent un nœud donné (ordre du JSON). */
export function courriersDuNoeud(nodeId: string): CourrierId[] {
  return courriers.filter((c) => c.declencheurs_noeuds.includes(nodeId)).map((c) => c.id);
}
