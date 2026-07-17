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
                  {c.id} - {c.titre}
                </span>
                {/* « On ne sait pas à quel moment envoyer les courriers » : le délai
                    est porté par la donnée (courriers-types-dde.json) - on le sort du
                    gris et on le nomme explicitement. */}
                <div className="mt-0.5 text-[13px] text-ink-2">
                  <span className="font-medium">Quand : </span>
                  {c.delai}
                </div>
                <div className="text-xs text-ink-3">
                  À : {c.destinataire} · Par : {c.mode_envoi}
                </div>
                {c.declencheurs_conditions?.length ? (
                  <div className="text-xs text-ink-4">
                    Si : {c.declencheurs_conditions.join(' · ')}
                  </div>
                ) : null}
              </div>
              <Link href={`/sinistre/courriers/${c.id}`}>
                <Button variant="secondary">Générer -</Button>
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
