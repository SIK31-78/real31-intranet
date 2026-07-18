'use client';

import { useEffect, useRef, useState } from 'react';
import { Glose } from './Glossaire';
import { References } from './ui';
import type { NodeId, QuestionNode } from '@/lib/domain/sinistre/types';

/**
 * Repli d'aide (H-1 bis) : TOUT le détail juridique d'une question (aide, liste
 * limitative, où trouver l'info, règles, références) vit ici, fermé par défaut.
 * L'écran par défaut = une question + ses options, rien d'autre : c'est la
 * condition pour ouvrir un sinistre vite. Le détail reste à un clic, jamais perdu.
 */
function AideRepliable({ node }: { node: QuestionNode }) {
  const [ouvert, setOuvert] = useState(false);

  const aDuContenu =
    Boolean(node.aide) ||
    Boolean(node.aide_liste) ||
    Boolean(node.aide_trancher) ||
    Boolean(node.regles?.length) ||
    Boolean(node.references?.length);
  if (!aDuContenu) return null;

  return (
    <div className="no-print mt-2">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-green-700 hover:bg-green-50 focus:outline focus:outline-2 focus:outline-green-700"
      >
        <span
          aria-hidden
          className="flex h-4 w-4 items-center justify-center rounded-full border border-green-700 text-[10px] font-bold leading-none"
        >
          ?
        </span>
        {ouvert ? 'Masquer l’aide' : 'Aide et références'}
      </button>

      {ouvert && (
        <div className="mt-2 rounded-md border border-line bg-surface-2 p-3 text-sm text-ink-2">
          {node.aide && (
            <p>
              <Glose>{node.aide}</Glose>
            </p>
          )}

          {/* Liste limitative explicitée par la donnée (ex. exclusions IRSI). */}
          {node.aide_liste && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                {node.aide_liste.titre}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {node.aide_liste.items.map((item, i) => (
                  <li key={i}>
                    <Glose>{item}</Glose>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {node.aide_trancher && (
            <p className="mt-3 text-[13px] text-ink-3">
              <span className="font-medium text-ink-2">Où trouver l’information : </span>
              {node.aide_trancher}
            </p>
          )}

          {node.regles?.length ? (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-[13px]">
              {node.regles.map((r, i) => (
                <li key={i}>
                  <Glose>{r}</Glose>
                </li>
              ))}
            </ul>
          ) : null}

          <References items={node.references} />
        </div>
      )}
    </div>
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

      <AideRepliable node={node} />

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
