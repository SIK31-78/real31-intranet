'use client';

/**
 * Mini-calculateur d'assiette (CLAUDE.md §6.2) — purement INDICATIF.
 * Somme de postes libres en € HT ; ne remplace pas le choix manuel de l'option.
 */

import { useState } from 'react';
import { parametres } from '@/lib/domain/sinistre/data';
import { Button } from './ui';

interface Poste {
  libelle: string;
  montant: string;
}

export function AssietteCalculator() {
  const [postes, setPostes] = useState<Poste[]>([
    { libelle: 'Dommages matériels', montant: '' },
    { libelle: 'Frais afférents', montant: '' },
  ]);

  const total = postes.reduce((s, p) => s + (Number(p.montant.replace(',', '.')) || 0), 0);
  const t1 = parametres.plafond_tranche_1_ht ?? 1600;
  const t2 = parametres.plafond_convention_ht ?? 5000;
  const tranche = total <= t1 ? 'tranche 1' : total <= t2 ? 'tranche 2' : 'hors IRSI (> 5 000 €)';

  function maj(i: number, patch: Partial<Poste>) {
    setPostes((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  return (
    <details className="mb-4 rounded-md border border-line bg-surface-2 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-ink-2">
        Mini-calculateur d’assiette (indicatif)
      </summary>
      <div className="mt-3 space-y-2">
        {postes.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input
              aria-label={`Libellé poste ${i + 1}`}
              value={p.libelle}
              onChange={(e) => maj(i, { libelle: e.target.value })}
              className="flex-1 rounded border border-line-2 px-2 py-1"
            />
            <input
              aria-label={`Montant HT poste ${i + 1}`}
              inputMode="decimal"
              value={p.montant}
              onChange={(e) => maj(i, { montant: e.target.value })}
              placeholder="€ HT"
              className="w-28 rounded border border-line-2 px-2 py-1 text-right"
            />
          </div>
        ))}
        <Button
          variant="ghost"
          onClick={() => setPostes((ps) => [...ps, { libelle: '', montant: '' }])}
        >
          + Ajouter un poste
        </Button>
        <div className="flex items-center justify-between border-t border-line pt-2 font-medium">
          <span>Total estimé</span>
          <span>
            {total.toLocaleString('fr-FR')} € HT — <span className="text-green-700">{tranche}</span>
          </span>
        </div>
        <p className="text-xs text-ink-3">
          Indicatif : retenez l’hypothèse haute en cas de doute proche d’un seuil, puis choisissez
          l’option ci-dessous.
        </p>
      </div>
    </details>
  );
}