/**
 * Courriers : le plan d'action séquencé, UNE seule façon de les présenter.
 *
 * Le composant ne décide de rien : il affiche un `PlanCourriers` calculé par le
 * domaine (`planifierCourriers` au résultat, `planifierCourriersEtape` sur un
 * écran d'étape). Ce qui part maintenant est en cartes, actionnable ; les suites
 * conditionnelles sont repliées, une ligne chacune. Le courrier ne se génère
 * toujours qu'au clic sur son bouton.
 *
 * RÈGLE DU BOUTON PLEIN (prop `contexte`). Un écran n'a qu'UN SEUL `variant="primary"`
 * et c'est l'action qui fait AVANCER le flux. D'où deux rendus :
 *   - `contexte="etape"` : le parcours continue, le bouton plein appartient à
 *     « Continuer ». Les « Générer » passent en `secondary` et tout le plan se
 *     REPLIE sous « Courrier(s) à envoyer (N) » : à l'ouverture d'un dégât des
 *     eaux, l'essentiel est de faire cesser la fuite, pas de sortir le papier.
 *   - `contexte="resultat"` : il n'y a plus rien à continuer, le plan EST l'écran.
 *     Il reste déplié et ses « Générer » du jour J gardent le bouton plein.
 * Le contexte est une PROP EXPLICITE : le composant ne devine pas sa route.
 *
 * RÈGLE À NE PAS REPERDRE : pertinence ≠ moment. Une version précédente listait
 * à plat, sur les écrans d'étape, tous les courriers dont les `declencheurs_noeuds`
 * citaient le nœud - « on est déjà DANS le moment du courrier ». C'est faux :
 * `declencheurs_noeuds` dit qu'un courrier CONCERNE ce parcours, pas qu'il part
 * depuis cet écran. Résultat : le premier écran du parcours proposait de générer
 * une mise en demeure LRAR (C3, moment réel J+15) au jour 0, à égalité avec
 * l'invitation à déclarer. La partition maintenant / plus tard vit dans le
 * domaine ; ici on ne fait que la rendre.
 */

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SectionTitle } from './ui';
import type { CourrierPlanifie, PlanCourriers } from '@/lib/domain/sinistre/engine/plan-courriers';
import type { Courrier, CourrierId } from '@/lib/domain/sinistre/types';

/** Où ce plan est affiché - décide du bouton plein et du repli (voir en-tête). */
export type ContextePlan = 'etape' | 'resultat';

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
function CarteMaintenant({
  plan,
  variantGenerer,
}: {
  plan: CourrierPlanifie;
  variantGenerer: 'primary' | 'secondary';
}) {
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
      <BoutonGenerer id={courrier.id} variant={variantGenerer} />
    </Card>
  );
}

/** Une suite conditionnelle : une ligne, jamais de bouton plein. */
function LignePlusTard({ plan }: { plan: CourrierPlanifie }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge ton="outline">{plan.courrier.id}</Badge>
          <span className="text-[13px] text-ink">{plan.courrier.titre}</span>
        </div>
        <div className="mt-0.5 text-[12px] text-ink-3">{plan.declencheur}</div>
      </div>
      <BoutonGenerer id={plan.courrier.id} variant="secondary" />
    </li>
  );
}

const SUMMARY_CLASS =
  'cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-ink-2 marker:content-none hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600';

function Chevron() {
  return (
    <span
      aria-hidden
      className="mr-1.5 inline-block text-ink-4 transition-transform group-open:rotate-90"
    >
      ▸
    </span>
  );
}

/**
 * Titre du repli d'un écran d'étape. On annonce ce qui part MAINTENANT, parce que
 * c'est l'action. Quand rien ne part depuis cet écran (défaut prudent de
 * `planifierCourriersEtape` : un nœud hors table ne pousse aucun [Générer]), on
 * annonce honnêtement les suites plutôt que d'écrire « à envoyer (0) ». Dans les
 * deux cas les DEUX listes sont dans le repli : rien n'est perdu.
 */
function titreRepliEtape(plan: PlanCourriers): string {
  const { maintenant, plusTard } = plan;
  if (maintenant.length > 0) {
    return `Courrier${maintenant.length > 1 ? 's' : ''} à envoyer (${maintenant.length})`;
  }
  return `Courrier${plusTard.length > 1 ? 's' : ''} à prévoir (${plusTard.length})`;
}

/** Le plan lui-même : ce qui part, puis les suites. Le repli est décidé au-dessus. */
function CorpsPlan({ plan, contexte }: { plan: PlanCourriers; contexte: ContextePlan }) {
  const { maintenant, plusTard } = plan;
  const etape = contexte === 'etape';

  return (
    <>
      {maintenant.length > 0 && (
        <>
          {/* Sur une étape, le titre du repli dit déjà « Courriers à envoyer ». */}
          {!etape && <SectionTitle>À faire maintenant</SectionTitle>}
          <div className={`flex flex-col gap-2 ${etape ? '' : 'mt-2'}`}>
            {maintenant.map((p) => (
              <CarteMaintenant
                key={p.courrier.id}
                plan={p}
                variantGenerer={etape ? 'secondary' : 'primary'}
              />
            ))}
          </div>
        </>
      )}

      {plusTard.length > 0 &&
        (etape ? (
          // Déjà dans un repli : un second niveau de `details` n'ajouterait qu'un
          // clic. La hiérarchie passe par le titre de section.
          <div className={maintenant.length > 0 ? 'mt-4' : ''}>
            <SectionTitle>Plus tard, si ça arrive</SectionTitle>
            <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-surface">
              {plusTard.map((p) => (
                <LignePlusTard key={p.courrier.id} plan={p} />
              ))}
            </ul>
          </div>
        ) : (
          <details className="group mt-4 rounded-md border border-line bg-surface">
            <summary className={SUMMARY_CLASS}>
              <Chevron />
              Plus tard, si ça arrive ({plusTard.length})
            </summary>
            <ul className="divide-y divide-line border-t border-line">
              {plusTard.map((p) => (
                <LignePlusTard key={p.courrier.id} plan={p} />
              ))}
            </ul>
          </details>
        ))}
    </>
  );
}

/**
 * Plan d'action des courriers. Sur le RÉSULTAT il est déplié et porte le bouton
 * plein ; sur une ÉTAPE il est replié et s'efface derrière « Continuer ».
 * Aucune information ne disparaît : le repli reste atteignable au clavier.
 */
export function PlanCourriersVue({
  plan,
  contexte,
}: {
  plan: PlanCourriers;
  contexte: ContextePlan;
}) {
  const { maintenant, plusTard } = plan;
  if (maintenant.length === 0 && plusTard.length === 0) return null;

  if (contexte === 'etape') {
    return (
      <details className="group mt-3 rounded-md border border-line bg-surface">
        <summary className={SUMMARY_CLASS}>
          <Chevron />
          {titreRepliEtape(plan)}
        </summary>
        <div className="border-t border-line p-4">
          <CorpsPlan plan={plan} contexte={contexte} />
        </div>
      </details>
    );
  }

  return (
    <div className="mt-6">
      <CorpsPlan plan={plan} contexte={contexte} />
    </div>
  );
}
