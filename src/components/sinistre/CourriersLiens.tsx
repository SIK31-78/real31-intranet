/**
 * Courriers : plan d'action séquencé (résultat) et liste compacte (étapes).
 *
 * Le plan ne décide de rien : il affiche `planifierCourriers` (domaine). Ce qui
 * part le jour J est en cartes, actionnable ; les suites conditionnelles sont
 * repliées et listées en une ligne chacune. Le courrier ne se génère toujours
 * qu'au clic sur son bouton.
 */

import Link from 'next/link';
import { courriers } from '@/lib/domain/sinistre/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SectionTitle } from './ui';
import type { CourrierPlanifie, PlanCourriers } from '@/lib/domain/sinistre/engine/plan-courriers';
import type { Courrier, CourrierId } from '@/lib/domain/sinistre/types';

/** Contexte d'envoi porté par la donnée : à qui, par quel canal, à quelle condition. */
function MetaCourrier({ courrier }: { courrier: Courrier }) {
  return (
    <>
      <div className="mt-0.5 text-[12px] text-ink-3">
        À : {courrier.destinataire} · Par : {courrier.mode_envoi}
      </div>
      {courrier.declencheurs_conditions?.length ? (
        <div className="text-[12px] text-ink-4">
          Si : {courrier.declencheurs_conditions.join(' · ')}
        </div>
      ) : null}
    </>
  );
}

function BoutonGenerer({ id, variant }: { id: CourrierId; variant: 'primary' | 'secondary' }) {
  return (
    <Link href={`/sinistre/courriers/${id}`} className="no-print shrink-0">
      <Button variant={variant}>Générer</Button>
    </Link>
  );
}

/** Un courrier du jour J : ce qu'on envoie, quand, et le bouton pour le faire. */
function CarteMaintenant({ plan }: { plan: CourrierPlanifie }) {
  const { courrier, quand } = plan;
  return (
    <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-medium text-ink">{courrier.titre}</span>
          <Badge ton="outline">{courrier.id}</Badge>
          <Badge ton="info">{quand}</Badge>
        </div>
        <MetaCourrier courrier={courrier} />
      </div>
      <BoutonGenerer id={courrier.id} variant="primary" />
    </Card>
  );
}

/**
 * Plan d'action du résultat. « Plus tard » est REPLIÉ : ce sont des suites
 * conditionnelles, dont certaines n'arriveront jamais - elles ne doivent pas
 * concurrencer visuellement ce qui part aujourd'hui.
 */
export function PlanCourriersVue({ plan }: { plan: PlanCourriers }) {
  const { maintenant, plusTard } = plan;
  if (maintenant.length === 0 && plusTard.length === 0) return null;

  return (
    <div className="mt-6">
      {maintenant.length > 0 && (
        <>
          <SectionTitle>À faire maintenant</SectionTitle>
          <div className="mt-2 flex flex-col gap-2">
            {maintenant.map((p) => (
              <CarteMaintenant key={p.courrier.id} plan={p} />
            ))}
          </div>
        </>
      )}

      {plusTard.length > 0 && (
        <details className="group mt-4 rounded-md border border-line bg-surface">
          <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-ink-2 marker:content-none hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
            <span
              aria-hidden
              className="mr-1.5 inline-block text-ink-4 transition-transform group-open:rotate-90"
            >
              ▸
            </span>
            Plus tard, si ça arrive ({plusTard.length})
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {plusTard.map((p) => (
              <li
                key={p.courrier.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge ton="outline">{p.courrier.id}</Badge>
                    <span className="text-[13px] text-ink">{p.courrier.titre}</span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-3">{p.declencheur}</div>
                </div>
                <BoutonGenerer id={p.courrier.id} variant="secondary" />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Liste des modèles déclenchés par un écran d'étape (ex. C9 sur la recherche de
 * fuite). Pas de plan ici : on est déjà DANS le moment du courrier.
 */
export function ListeCourriersLiens({ ids }: { ids: CourrierId[] }) {
  if (ids.length === 0) return null;
  return (
    <div className="mt-6 rounded-md border border-line bg-surface p-4">
      <SectionTitle>Modèles de mails ou courriers recommandés</SectionTitle>
      <ul className="mt-1 divide-y divide-line">
        {ids.map((id) => {
          const c = courriers.find((x) => x.id === id);
          if (!c) return null;
          return (
            <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge ton="outline">{c.id}</Badge>
                  <span className="text-[13px] font-medium text-ink">{c.titre}</span>
                </div>
                {/* Le délai est porté par la donnée (courriers-types-dde.json) :
                    on le nomme explicitement plutôt que de le noyer en gris. */}
                <div className="mt-0.5 text-[12px] text-ink-2">
                  <span className="font-medium">Quand : </span>
                  {c.delai}
                </div>
                <MetaCourrier courrier={c} />
              </div>
              <BoutonGenerer id={c.id} variant="secondary" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Courriers dont les déclencheurs incluent un nœud donné (ordre du JSON). */
export function courriersDuNoeud(nodeId: string): CourrierId[] {
  return courriers.filter((c) => c.declencheurs_noeuds.includes(nodeId)).map((c) => c.id);
}
