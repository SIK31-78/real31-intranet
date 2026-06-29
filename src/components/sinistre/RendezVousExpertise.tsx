'use client';

/**
 * Bloc « Rendez-vous d'expertise » par local (H-3), affiché sur les écrans
 * d'expertise (résultats r_t2 et r_cidecop) et récapitulé en synthèse.
 * Aucune logique métier attachée à `facture` au MVP (préparation V2/V3).
 */

import { useDossier, useActiveLocal } from '@/lib/domain/sinistre/state/store';
import { Button, SectionTitle } from './ui';
import { aujourdhuiISO } from '@/lib/domain/sinistre/util/date';
import type { ConvoquePar } from '@/lib/domain/sinistre/types';

const CONVOQUE_OPTIONS: { value: ConvoquePar; label: string }[] = [
  { value: 'assureur_immeuble', label: "Assureur de l'immeuble" },
  { value: 'assureur_partie', label: "Assureur d'une partie" },
  { value: 'autre', label: 'Autre' },
];

export function BlocRendezVousExpertise() {
  const { dispatch } = useDossier();
  const local = useActiveLocal();
  const rdvs = local.rendezVousExpertise ?? [];

  return (
    <div className="mt-6 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <SectionTitle>Rendez-vous d’expertise</SectionTitle>
        <Button variant="secondary" onClick={() => dispatch({ type: 'AJOUTER_RDV' })}>
          + Ajouter un RDV
        </Button>
      </div>

      {rdvs.length === 0 && (
        <p className="mt-2 text-sm text-ink-3">Aucun rendez-vous noté pour ce local.</p>
      )}

      <ul className="mt-3 space-y-3">
        {rdvs.map((rdv) => (
          <li key={rdv.id} className="rounded-md border border-line p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-ink-3">Date</span>
                <input
                  type="date"
                  value={rdv.date}
                  max={aujourdhuiISO()}
                  onChange={(e) => dispatch({ type: 'MAJ_RDV', id: rdv.id, patch: { date: e.target.value } })}
                  className="mt-0.5 w-full rounded border border-line-2 px-2 py-1"
                  aria-label="Date du rendez-vous d'expertise"
                />
              </label>
              <label className="text-sm">
                <span className="text-ink-3">Lieu</span>
                <input
                  value={rdv.lieu ?? ''}
                  onChange={(e) => dispatch({ type: 'MAJ_RDV', id: rdv.id, patch: { lieu: e.target.value } })}
                  className="mt-0.5 w-full rounded border border-line-2 px-2 py-1"
                />
              </label>
              <label className="text-sm">
                <span className="text-ink-3">Convoqué par</span>
                <select
                  value={rdv.convoquePar}
                  onChange={(e) =>
                    dispatch({
                      type: 'MAJ_RDV',
                      id: rdv.id,
                      patch: { convoquePar: e.target.value as ConvoquePar },
                    })
                  }
                  className="mt-0.5 w-full rounded border border-line-2 px-2 py-1"
                  aria-label="Convoqué par"
                >
                  {CONVOQUE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-ink-3">Précision (assureur / cabinet)</span>
                <input
                  value={rdv.precisionConvocant ?? ''}
                  onChange={(e) =>
                    dispatch({ type: 'MAJ_RDV', id: rdv.id, patch: { precisionConvocant: e.target.value } })
                  }
                  className="mt-0.5 w-full rounded border border-line-2 px-2 py-1"
                />
              </label>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={rdv.facture}
                  onChange={(e) => dispatch({ type: 'MAJ_RDV', id: rdv.id, patch: { facture: e.target.checked } })}
                />
                Facturé
              </label>
              <Button
                variant="ghost"
                aria-label="Supprimer ce rendez-vous"
                onClick={() => dispatch({ type: 'SUPPRIMER_RDV', id: rdv.id })}
              >
                Supprimer
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}