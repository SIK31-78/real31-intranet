'use client';

import { useEffect, useRef } from 'react';
import { Glose } from './Glossaire';
import type { NodeId, QuestionNode } from '@/lib/domain/sinistre/types';

export function QuestionView({
  node,
  nodeId,
  onAnswer,
  disabled = false,
}: {
  node: QuestionNode;
  nodeId: NodeId;
  onAnswer: (optionIndex: number) => void;
  disabled?: boolean;
}) {
  // H-1 : la présélection visuelle (focus) est pilotée par la donnée
  // `option_par_defaut` (index). Par défaut, à défaut de valeur, la première
  // option. Aucune réponse n'est enregistrée tant qu'on n'a pas cliqué.
  const indexDefaut = node.option_par_defaut ?? 0;
  const optionDefaut = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    optionDefaut.current?.focus();
  }, [nodeId]);

  return (
    <div>
      <h2 className="text-xl font-semibold text-ink">
        <Glose>{node.question}</Glose>
      </h2>

      <div className="mt-5 grid gap-2">
        {node.options.map((opt, i) => (
          <button
            key={i}
            ref={i === indexDefaut ? optionDefaut : undefined}
            onClick={() => onAnswer(i)}
            disabled={disabled}
            className="rounded-lg border border-line-2 bg-surface px-4 py-3 text-left transition hover:border-green-600 hover:bg-green-50 focus:outline focus:outline-2 focus:outline-green-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line-2 disabled:hover:bg-surface"
          >
            <span className="font-medium text-ink">{opt.label}</span>
            {opt.note && <span className="mt-0.5 block text-xs text-ink-3">{opt.note}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
