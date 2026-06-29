'use client';

/**
 * Panneau FACULTATIF de saisie des coordonnées (CLAUDE.md extension parties).
 * Non bloquant : la réponse à la question reste seule obligatoire. Alimente la
 * `FicheSinistre` du dossier en cours ; réutilisé ensuite par les courriers.
 */

import { useDossier, useActiveLocal } from '@/lib/domain/sinistre/state/store';
import { cibleCapture } from '@/lib/domain/sinistre/state/capture';
import type { NodeId, Partie, RolePartie } from '@/lib/domain/sinistre/types';

const STATUT_LABEL: Record<Partie['statutAssurance'], string> = {
  assure: 'assuré (déduit)',
  non_assure: 'non assuré (déduit)',
  inconnu: 'inconnu',
};

function Champ({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-ink-3">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded border border-line-2 px-2 py-1"
      />
    </label>
  );
}

function PartiePanel({ role }: { role: RolePartie }) {
  const { dispatch } = useDossier();
  const local = useActiveLocal();
  const partie = local.parties?.[role];
  const titre = role === 'coproprietaire' ? 'copropriétaire' : 'occupant';

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Champ
        label={`Nom du ${titre}`}
        value={partie?.nom ?? ''}
        onChange={(v) => dispatch({ type: 'SET_PARTIE', role, patch: { nom: v } })}
      />
      <Champ
        label="Email"
        type="email"
        value={partie?.email ?? ''}
        onChange={(v) => dispatch({ type: 'SET_PARTIE', role, patch: { email: v } })}
      />
      <Champ
        label="Assureur — nom"
        value={partie?.assureur?.nom ?? ''}
        onChange={(v) => dispatch({ type: 'SET_PARTIE_ASSUREUR', role, patch: { nom: v } })}
      />
      <Champ
        label="N° de police"
        value={partie?.assureur?.numeroPolice ?? ''}
        onChange={(v) => dispatch({ type: 'SET_PARTIE_ASSUREUR', role, patch: { numeroPolice: v } })}
      />
      <Champ
        label="N° de sinistre"
        value={partie?.assureur?.numeroSinistre ?? ''}
        onChange={(v) =>
          dispatch({ type: 'SET_PARTIE_ASSUREUR', role, patch: { numeroSinistre: v } })
        }
      />
      <div className="self-end text-xs text-ink-3">
        Statut d’assurance : {STATUT_LABEL[partie?.statutAssurance ?? 'inconnu']}
      </div>
    </div>
  );
}

function AssureurImmeublePanel() {
  const { state, dispatch } = useDossier();
  const a = state.assureurImmeuble;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Champ
        label="Assureur immeuble — nom"
        value={a?.nom ?? ''}
        onChange={(v) => dispatch({ type: 'SET_ASSUREUR_IMMEUBLE', patch: { nom: v } })}
      />
      <Champ
        label="N° de police collective"
        value={a?.numeroPolice ?? ''}
        onChange={(v) => dispatch({ type: 'SET_ASSUREUR_IMMEUBLE', patch: { numeroPolice: v } })}
      />
      <Champ
        label="N° de sinistre"
        value={a?.numeroSinistre ?? ''}
        onChange={(v) => dispatch({ type: 'SET_ASSUREUR_IMMEUBLE', patch: { numeroSinistre: v } })}
      />
    </div>
  );
}

export function CapturePanel({ nodeId }: { nodeId: NodeId }) {
  const cible = cibleCapture(nodeId);
  if (!cible) return null;

  return (
    <details className="no-print mt-4 rounded-md border border-line bg-surface-2 p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink-3">
        Renseigner les coordonnées (facultatif)
      </summary>
      <div className="mt-3">
        {cible.kind === 'partie' ? <PartiePanel role={cible.role} /> : <AssureurImmeublePanel />}
      </div>
    </details>
  );
}