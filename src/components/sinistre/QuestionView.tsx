'use client';

import { useEffect, useRef } from 'react';
import { Glose } from './Glossaire';
import { AssietteCalculator } from './AssietteCalculator';
import { PointsVigilance } from './PointsVigilance';
import { GlosedList, References, SectionTitle } from './ui';
import { nodes } from '@/lib/domain/sinistre/data';
import type { NodeId, QuestionNode } from '@/lib/domain/sinistre/types';

/**
 * Aide au calcul de l'assiette (G-3) : repliée par défaut, sur l'écran de tranche.
 * Le contenu (composition, références) provient du nœud transparent etape_assiette ;
 * rien n'est imposé, le mini-calculateur reste optionnel.
 */
function AideAssiette() {
  const n = nodes['etape_assiette'];
  const composition = n && n.type === 'etape' ? n.composition_assiette : undefined;
  const references = n && n.type === 'etape' ? n.references : undefined;
  return (
    <details className="mt-4 rounded-md border border-line bg-surface-2 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-ink-2">
        Aide au calcul de l’assiette
      </summary>
      <div className="mt-3 space-y-3">
        {composition &&
          Object.entries(composition).map(([key, items]) => (
            <div key={key}>
              <SectionTitle>{key.replace(/_/g, ' ')}</SectionTitle>
              <GlosedList items={items} />
            </div>
          ))}
        <AssietteCalculator />
        <References items={references} />
      </div>
    </details>
  );
}

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

      {node.aide && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-medium text-green-700">En savoir plus</summary>
          <p className="mt-2 whitespace-pre-line text-ink-3">
            <Glose>{node.aide}</Glose>
          </p>
        </details>
      )}

      {node.aide_trancher && (
        <div className="mt-3 flex gap-2 rounded-md border-l-4 border-info-500 bg-info-50 p-3 text-sm text-info-700">
          <span aria-hidden className="font-bold">ⓘ</span>
          <span>
            <span className="font-medium">Où trouver l’information : </span>
            <Glose>{node.aide_trancher}</Glose>
          </span>
        </div>
      )}

      {node.regles && (
        <div className="mt-3 rounded-md bg-surface-2 p-3">
          <GlosedList items={node.regles} />
        </div>
      )}

      {/* Aide au calcul de l'assiette (repliée), propre au nœud de tranche (G-3). */}
      {nodeId === 'q_tranche' && <AideAssiette />}

      {/* Points de vigilance (cases à cocher, ex. parquet/Titre 10) — G-6. */}
      {node.points_vigilance && <PointsVigilance points={node.points_vigilance} />}

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

      <References items={node.references} />
    </div>
  );
}