'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Glose } from './Glossaire';
import { Button, GlosedList, SectionTitle } from './ui';
import {
  cas213,
  courriersRecommandes,
  gestionnaireNode,
  resultatNode,
} from '@/lib/domain/sinistre/engine/wizard';
import { syntheseDossierSinistre } from '@/lib/domain/sinistre/engine/synthese';
import { useDossier, useActiveLocal } from '@/lib/domain/sinistre/state/store';
import { reporterSyntheseSinistreAction } from '@/app/dossiers/actions';
import { ListeCourriersLiens } from './CourriersLiens';
import type { ResultatNode } from '@/lib/domain/sinistre/types';

export function Resultat() {
  const { state } = useDossier();
  const local = useActiveLocal();
  const wizard = local.wizard;
  const node = resultatNode(wizard) as ResultatNode;

  // Contexte dossier (incrément 2) : si on est arrivé via /sinistre/wizard?dossier=<id>,
  // on propose de reporter la synthèse dans le journal de ce dossier.
  const dossierId = useSearchParams().get('dossier');
  const [pending, startTransition] = useTransition();
  const [reporte, setReporte] = useState(false);

  const reporterDansDossier = () => {
    if (!dossierId) return;
    const texte = syntheseDossierSinistre(state);
    startTransition(async () => {
      await reporterSyntheseSinistreAction(dossierId, texte);
      setReporte(true);
    });
  };

  const gest = gestionnaireNode(wizard);
  const cas = cas213(wizard);
  const recommandes = courriersRecommandes(wizard);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-green-900">Synthèse</p>
          <h2 className="text-2xl font-bold text-ink">
            <Glose>{node.titre}</Glose>
          </h2>
          <p className="mt-1 text-sm text-ink-3">
            {state.referenceInterne} · {local.libelle}
            {state.immeuble.nom ? ` · ${state.immeuble.nom}` : ''}
          </p>
        </div>
        <div className="no-print flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            Imprimer / PDF
          </Button>
        </div>
      </div>

      {dossierId && (
        <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm">
          {reporte ? (
            <span className="font-medium text-green-900">Synthèse reportée dans le dossier</span>
          ) : (
            <span className="text-green-900">
              Reporter cette synthèse (résultat, gestionnaire, tranche, courriers) dans le journal du dossier.
            </span>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {!reporte && (
              <Button variant="primary" onClick={reporterDansDossier} disabled={pending}>
                {pending ? 'Report en cours…' : 'Reporter la synthèse dans le dossier'}
              </Button>
            )}
            <Link
              href={`/dossiers/${dossierId}`}
              className="text-[13px] font-medium text-green-700 underline hover:text-green-900"
            >
              Revenir au dossier
            </Link>
          </div>
        </div>
      )}

      {gest && (
        <div className="mt-4 rounded-md border border-green-100 bg-green-50 p-3 text-sm">
          <span className="font-semibold text-green-900">Assureur gestionnaire : </span>
          <span className="text-green-900">{gest.gestionnaire?.replace(/_/g, ' ')}</span>
          {cas !== undefined && (
            <span className="text-green-700"> - cas {cas} du tableau IRSI 2.1.3</span>
          )}
        </div>
      )}

      {node.prise_en_charge && (
        <div className="mt-4">
          <SectionTitle>Règles de prise en charge</SectionTitle>
          <GlosedList items={node.prise_en_charge} />
        </div>
      )}

      {/* Bloc « Modèles de mails ou courriers recommandés ». */}
      <ListeCourriersLiens ids={recommandes} />
    </div>
  );
}
