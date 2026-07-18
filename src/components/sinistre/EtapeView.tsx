'use client';

import Link from 'next/link';
import { Glose } from './Glossaire';
import { ChecklistMesures } from './ChecklistMesures';
import { PlanCourriersVue } from './CourriersLiens';
import { AlertBox } from './ui';
import { Button } from '@/components/ui/button';
import { planifierCourriersEtape } from '@/lib/domain/sinistre/engine/plan-courriers';
import { subsidiariteParIncertitude } from '@/lib/domain/sinistre/engine/wizard';
import { libelleGestionnaire } from '@/lib/domain/sinistre/util/gestionnaire';
import { useActiveLocal, useDossier } from '@/lib/domain/sinistre/state/store';
import type { EtapeNode } from '@/lib/domain/sinistre/types';

/**
 * Bandeau d'avertissement (E-2) : la subsidiarité résulte ici d'un « Je ne sais
 * pas », pas d'un défaut d'assurance constaté. Le résultat conventionnel est
 * provisoire ; il faut obtenir l'attestation (C5).
 *
 * RESTE DÉPLIÉ, contrairement au reste du contexte de l'écran : il porte un
 * avertissement ET une action. Le replier reviendrait à cacher que le résultat
 * affiché est provisoire - sur un module juridique, ce n'est pas une option.
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
        {/* Le bouton plein de cet écran appartient à « Continuer » : générer C5
            fait SORTIR du parcours, ça ne peut pas dominer ce qui l'avance. */}
        <Link href="/sinistre/courriers/C5">
          <Button variant="secondary">Générer le courrier C5 (demande d’attestation)</Button>
        </Link>
        <Button variant="secondary" onClick={() => dispatch({ type: 'BACK' })}>
          Revenir à la question d’assurance
        </Button>
      </div>
    </div>
  );
}

/**
 * L'alerte du nœud, REPLIÉE. C'est du contexte juridique à connaître (qui doit
 * réparer, ce que dit l'IRSI), pas un geste : elle ne doit pas s'intercaler entre
 * la checklist et « Continuer ». Rien n'est perdu - le repli est atteignable au
 * clavier et l'encart garde son `role="note"`.
 *
 * Libellé GÉNÉRIQUE et stable : `alerte` est un texte libre du JSON. On ne peut
 * pas en dériver un titre honnête sans le résumer, donc on ne le résume pas.
 */
function RepliCeQuIlFautSavoir({ alerte }: { alerte: string }) {
  return (
    <details className="no-print group mt-3 rounded-md border border-line bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-ink-2 marker:content-none hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
        <span
          aria-hidden
          className="mr-1.5 inline-block text-ink-4 transition-transform group-open:rotate-90"
        >
          ▸
        </span>
        Ce qu’il faut savoir
      </summary>
      <div className="border-t border-line px-4 pb-4">
        <AlertBox>{alerte}</AlertBox>
      </div>
    </details>
  );
}

/**
 * Écran d'étape. LA CHECKLIST EST L'ÉCRAN : à l'instant où on ouvre un dégât des
 * eaux, l'essentiel est de faire cesser la fuite. Elle reste donc juste sous le
 * titre, pleine et visible. Le contexte juridique (`alerte`) et le plan de
 * courriers se replient SOUS elle.
 *
 * UN SEUL BOUTON PLEIN : « Continuer ». C'est lui qui fait avancer le parcours ;
 * « Générer » en fait sortir (vers /sinistre/courriers/{id}) et passe donc en
 * `secondary` - ici comme dans `PlanCourriersVue` (`contexte="etape"`).
 */
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
          Assureur gestionnaire désigné : {libelleGestionnaire(node.gestionnaire)}
        </p>
      )}

      {node.checklist && (
        <div className="mt-4">
          {/* F-1 : seules les vraies mesures conservatoires (phase « urgence »). */}
          <ChecklistMesures items={node.checklist.filter((i) => i.phase === 'urgence')} />
        </div>
      )}

      {node.alerte && <RepliCeQuIlFautSavoir alerte={node.alerte} />}

      {/* H-2 : les courriers de cet écran, partitionnés par le domaine. Repliés :
          sur une étape le papier attend que le geste soit fait ; ce qui part
          maintenant reste à un clic, et rien n'est perdu. */}
      <PlanCourriersVue plan={planifierCourriersEtape(local.wizard.current)} contexte="etape" />

      <div className="no-print mt-6">
        <Button variant="primary" onClick={onContinue} disabled={disabled}>
          Continuer →
        </Button>
      </div>
    </div>
  );
}
