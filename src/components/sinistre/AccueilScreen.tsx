'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDossier, nouveauDossier, purgerBrouillon, useActiveLocal } from '@/lib/domain/sinistre/state/store';
import { Button } from './ui';

export function AccueilScreen() {
  const { state, dispatch } = useDossier();
  const active = useActiveLocal();
  const router = useRouter();
  const brouillonEnCours = active.wizard.steps.length > 0 || state.date !== '';

  function demarrer() {
    purgerBrouillon();
    dispatch({ type: 'CHARGER', state: nouveauDossier() });
    router.push('/sinistre/wizard');
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Gestion d&apos;un dégât des eaux en copropriété</h1>
        <p className="mx-auto mt-2 max-w-2xl text-ink-3">
          Guide pas à pas en application des conventions IRSI (février 2020) et CIDECOP, et
          génération des courriers types pré-remplis.
        </p>
      </div>

      {brouillonEnCours && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-green-900">
              Un dossier est en cours&nbsp;: <strong>{state.referenceInterne}</strong>
              {state.immeuble.nom ? ` — ${state.immeuble.nom}` : ''}.
            </span>
            <div className="flex gap-2">
              <Link href="/sinistre/wizard">
                <Button variant="primary">Reprendre</Button>
              </Link>
              <Button variant="secondary" onClick={demarrer}>
                Abandonner et recommencer
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <button
          onClick={demarrer}
          className="group rounded-lg border border-green-200 bg-surface p-8 text-left shadow-1 transition hover:border-green-600 hover:shadow-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        >
          <div className="text-xl font-semibold text-green-900">Nouveau sinistre</div>
          <div className="mt-1 font-medium text-ink-2">Parcours guidé</div>
          <p className="mt-3 text-sm text-ink-3">
            Qualification du sinistre, désignation de l&apos;assureur gestionnaire, tranche, recours, puis
            synthèse imprimable et courriers. Recommandé pour tous les profils.
          </p>
          <span className="mt-4 inline-block font-medium text-green-700 group-hover:underline">
            Démarrer →
          </span>
        </button>

        <Link
          href="/sinistre/fiches"
          className="group rounded-lg border border-line bg-surface p-8 text-left shadow-1 transition hover:border-ink-4 hover:shadow-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        >
          <div className="text-xl font-semibold text-ink">Accès direct</div>
          <div className="mt-1 font-medium text-ink-2">Fiches réflexes</div>
          <p className="mt-3 text-sm text-ink-3">
            Tableaux de désignation du gestionnaire, recherche de fuite, tranches &amp; assiette,
            recours &amp; barème, CIDECOP. Pour les gestionnaires confirmés.
          </p>
          <span className="mt-4 inline-block font-medium text-ink-2 group-hover:underline">
            Consulter →
          </span>
        </Link>
      </div>
    </div>
  );
}
