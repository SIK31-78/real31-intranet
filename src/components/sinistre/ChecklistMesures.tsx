'use client';

/**
 * Checklist tri-états (C-1) avec responsable par mesure (D-1).
 * Pour chaque item : « Fait » (gestionnaire) ou « Demandé » (tiers), et
 * « Sans objet », mutuellement exclusifs. Aucune coche ⇒ « à faire ».
 * Aucun blocage de navigation. État stocké par id dans le local en cours.
 *
 * `MesureRow` est réutilisé par l'encart interactif de la synthèse (D-3).
 */

import { useDossier, useActiveLocal } from '@/lib/domain/sinistre/state/store';
import { Glose } from './Glossaire';
import { estActionGestionnaire, labelResponsable, verbeFait } from '@/lib/domain/sinistre/util/responsable';
import type { ChecklistItem, MesureEtat } from '@/lib/domain/sinistre/types';

export function MesureRow({ item }: { item: ChecklistItem }) {
  const { dispatch } = useDossier();
  const local = useActiveLocal();
  const etat = (local.mesures ?? {})[item.id];
  const tiers = !estActionGestionnaire(item.responsable);

  function basculer(cible: MesureEtat) {
    dispatch({ type: 'SET_MESURE', key: item.id, etat: etat === cible ? null : cible });
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-line bg-surface p-2">
      <span className="flex-1 text-sm text-ink-2">
        <Glose>{item.libelle}</Glose>
        <span
          className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs ${
            tiers ? 'bg-warn-50 text-warn-700' : 'bg-surface-2 text-ink-2'
          }`}
        >
          {tiers ? '- à demander : ' : ''}
          {labelResponsable(item.responsable)}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={etat === 'fait'} onChange={() => basculer('fait')} />
          {verbeFait(item.responsable)}
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={etat === 'sans_objet'}
            onChange={() => basculer('sans_objet')}
          />
          Sans objet
        </label>
        {etat === undefined && (
          <span className="rounded-full bg-warn-50 px-2 py-0.5 text-xs font-medium text-warn-700">
            à faire
          </span>
        )}
      </div>
    </li>
  );
}

export function ChecklistMesures({ items }: { items: ChecklistItem[] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink-2">
        Mesures à réaliser - indiquez où vous en êtes{' '}
        <span className="font-normal text-ink-3">(rien ne bloque la suite)</span>
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <MesureRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}