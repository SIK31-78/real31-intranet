'use client';

/**
 * Points de vigilance (G-6) : cases à cocher sur l'écran de tranche. Cocher une
 * case déplie un encart d'avertissement (titre, corps, références). L'état est
 * mémorisé dans le local pour réaffichage et rappel en synthèse.
 */

import { useDossier, useActiveLocal } from '@/lib/domain/sinistre/state/store';
import { Glose } from './Glossaire';
import { References } from './ui';
import type { PointVigilance } from '@/lib/domain/sinistre/types';

export function EncartVigilance({ point }: { point: PointVigilance }) {
  return (
    <div className="mt-2 rounded-md border-l-4 border-warn-500 bg-warn-50 p-3 text-sm text-warn-700">
      <p className="font-semibold">{point.titre}</p>
      <p className="mt-1">
        <Glose>{point.corps}</Glose>
      </p>
      <References items={point.references} />
    </div>
  );
}

export function PointsVigilance({ points }: { points: PointVigilance[] }) {
  const { dispatch } = useDossier();
  const local = useActiveLocal();
  const etats = local.pointsVigilance ?? {};

  return (
    <div className="mt-4 space-y-2">
      {points.map((p) => {
        const coche = etats[p.id] === true;
        return (
          <div key={p.id}>
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={coche}
                onChange={(e) =>
                  dispatch({ type: 'SET_POINT_VIGILANCE', id: p.id, valeur: e.target.checked })
                }
              />
              {p.declencheur_case}
            </label>
            {coche && <EncartVigilance point={p} />}
          </div>
        );
      })}
    </div>
  );
}