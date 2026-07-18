'use client';

/**
 * Helpers UI SPÉCIFIQUES au module sinistre - tout ce qui est couplé au métier
 * (glossaire, références conventionnelles, alertes d'étape).
 *
 * Les primitives génériques (Card, Button, Badge) vivent dans `@/components/ui`
 * et sont utilisées directement : ce fichier en hébergeait des copies avec des
 * signatures divergentes, c'était la dette de l'app d'origine.
 */

import type { ReactNode } from 'react';
import { Glose } from './Glossaire';

/** Références conventionnelles portées par un nœud (IRSI, CIDECOP, Code…). */
export function References({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return <p className="mt-3 text-xs text-ink-4">Références : {items.join(' · ')}</p>;
}

/** Encadré d'alerte visuellement distinct (étapes), glosable. */
export function AlertBox({ children }: { children: ReactNode }) {
  return (
    <div
      role="note"
      className="mt-3 flex gap-2 rounded-md border-l-4 border-warn-500 bg-warn-50 p-3 text-sm text-warn-700"
    >
      <span>{typeof children === 'string' ? <Glose>{children}</Glose> : children}</span>
    </div>
  );
}

/** Liste à puces dont chaque item peut être glosé. */
export function GlosedList({ items, className = '' }: { items: string[]; className?: string }) {
  return (
    <ul className={`list-disc space-y-1 pl-5 text-sm text-ink-2 ${className}`}>
      {items.map((it, i) => (
        <li key={i}>
          <Glose>{it}</Glose>
        </li>
      ))}
    </ul>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{children}</h3>
  );
}
