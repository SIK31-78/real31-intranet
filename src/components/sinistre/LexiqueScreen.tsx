'use client';

import { useMemo, useState } from 'react';
import { lexique } from '@/lib/domain/sinistre/data';
import { normalize } from '@/lib/domain/sinistre/util/text';

function titre(key: string): string {
  const t = key.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function LexiqueScreen() {
  const [q, setQ] = useState('');
  const entries = useMemo(() => Object.entries(lexique), []);
  const filtre = normalize(q.trim());
  const visibles = filtre
    ? entries.filter(([k, v]) => normalize(`${titre(k)} ${v}`).includes(filtre))
    : entries;

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Lexique</h1>
      <p className="mt-1 text-sm text-ink-3">
        Définitions issues des conventions IRSI et CIDECOP.
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher un terme…"
        className="mt-4 w-full max-w-md rounded-md border border-line-2 px-3 py-2"
        aria-label="Rechercher dans le lexique"
      />

      <dl className="mt-6 space-y-4">
        {visibles.map(([key, def]) => (
          <div key={key} id={key} className="scroll-mt-20 rounded-lg border border-line bg-surface p-4">
            <dt className="font-semibold text-ink">{titre(key)}</dt>
            <dd className="mt-1 text-sm text-ink-2">{def}</dd>
          </div>
        ))}
        {visibles.length === 0 && <p className="text-sm text-ink-3">Aucun terme ne correspond.</p>}
      </dl>
    </div>
  );
}
