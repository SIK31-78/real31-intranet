'use client';

import Link from 'next/link';
import { Glose } from './Glossaire';
import { ChecklistMesures } from './ChecklistMesures';
import { ListeCourriersLiens, courriersDuNoeud } from './CourriersLiens';
import { AlertBox } from './ui';
import { Button } from '@/components/ui/button';
import { subsidiariteParIncertitude } from '@/lib/domain/sinistre/engine/wizard';
import { useActiveLocal, useDossier } from '@/lib/domain/sinistre/state/store';
import type { EtapeNode } from '@/lib/domain/sinistre/types';

/**
 * Bandeau d'avertissement (E-2) : la subsidiarité résulte ici d'un « Je ne sais
 * pas », pas d'un défaut d'assurance constaté. Le résultat conventionnel est
 * provisoire ; il faut obtenir l'attestation (C5).
 */
function BandeauIncertitude() {
  const { dispatch } = useDossier();
  return (
    <div className="no-print mb-4 rounded-md border-l-4 border-warn-500 bg-warn-50 p-4 text-sm text-warn-700">
      <p className="font-semibold">Résultat provisoire - situation d’assurance à confirmer</p>
      <p className="mt-1">
        Vous avez indiqué ne pas connaître la situation d’assurance de cette partie. Par prudence,
        le sinistre est ici orienté vers l’assureur de l’immeuble (subsidiarité).{' '}
        <strong>Un défaut d’assurance est rare</strong> : dans la plupart des cas, la partie est
        assurée et c’est alors <strong>son</strong> assureur qui gère le sinistre, pas celui de
        l’immeuble.
      </p>
      <p className="mt-1">
        <strong>À faire sans délai</strong> : obtenir l’attestation d’assurance (courrier C5
        ci-dessous). Dès réception, reprenez cette étape pour confirmer ou corriger la désignation.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/sinistre/courriers/C5">
          <Button variant="primary">Générer le courrier C5 (demande d’attestation)</Button>
        </Link>
        <Button variant="secondary" onClick={() => dispatch({ type: 'BACK' })}>
          Revenir à la question d’assurance
        </Button>
      </div>
    </div>
  );
}

export function EtapeView({
  node,
  onContinue,
  disabled = false,
}: {
  node: EtapeNode;
  onContinue: () => void;
  disabled?: boolean;
}) {
  const local = useActiveLocal();
  const incertitude =
    node.gestionnaire === 'assureur_immeuble' && subsidiariteParIncertitude(local.wizard);

  return (
    <div>
      {incertitude && <BandeauIncertitude />}

      <h2 className="text-xl font-semibold text-ink">
        <Glose>{node.titre}</Glose>
      </h2>

      {node.gestionnaire && (
        <p className="mt-1 text-sm font-medium text-ink-2">
          Assureur gestionnaire désigné : {node.gestionnaire.replace(/_/g, ' ')}
        </p>
      )}

      {node.checklist && (
        <div className="mt-4">
          {/* F-1 : seules les vraies mesures conservatoires (phase « urgence »). */}
          <ChecklistMesures items={node.checklist.filter((i) => i.phase === 'urgence')} />
        </div>
      )}

      {node.alerte && <AlertBox>{node.alerte}</AlertBox>}

      {/* Modèles déclenchés par cet écran (ex. C9 sur la recherche de fuite) - H-2. */}
      <ListeCourriersLiens ids={courriersDuNoeud(local.wizard.current)} />

      <div className="no-print mt-6">
        <Button variant="primary" onClick={onContinue} disabled={disabled}>
          Continuer -
        </Button>
      </div>
    </div>
  );
}
