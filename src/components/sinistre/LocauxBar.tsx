'use client';

import type { RefObject } from 'react';
import { useDossier } from '@/lib/domain/sinistre/state/store';
import { aBrancheParLocal } from '@/lib/domain/sinistre/engine/phases';
import { nomLocalValide } from '@/lib/domain/sinistre/util/local';
import { currentNode, isTerminal } from '@/lib/domain/sinistre/engine/wizard';
import type { LocalSinistre } from '@/lib/domain/sinistre/types';

function statutLocal(local: LocalSinistre): string {
  const node = currentNode(local.wizard);
  if (isTerminal(local.wizard) && 'titre' in node) return node.titre;
  return 'titre' in node ? `En cours - ${node.titre}` : 'En cours';
}

export interface LocauxBarProps {
  /** Champ « nom » du local actif - l'écran y renvoie le focus quand le nom bloque. */
  refNomActif?: RefObject<HTMLInputElement | null>;
  /** Signale visuellement le nom manquant (seulement après une tentative d'avancer). */
  nomEnErreur?: boolean;
}

/**
 * Locaux sinistrés : sélection, nommage (obligatoire, G-4), ajout / retrait.
 *
 * DEUX RENDUS, une seule logique. Tant qu'il n'y a qu'UN local (le cas courant :
 * un DDE simple), la barre d'onglets ne sert à rien - on n'affiche qu'une ligne :
 * le nom du local, et l'ajout d'un second. Dès le 2e local, la barre complète
 * revient (il faut voir sur quel local on répond, et pouvoir en retirer un).
 */
export function LocauxBar({ refNomActif, nomEnErreur = false }: LocauxBarProps = {}) {
  const { state, dispatch } = useDossier();
  const active = state.locaux.find((l) => l.id === state.activeLocalId)!;
  const peutAjouter = aBrancheParLocal(active.wizard);
  const peutSupprimer = state.locaux.length > 1;

  function supprimer(l: LocalSinistre) {
    if (
      window.confirm(
        `Retirer ce local sinistré ? Les réponses saisies pour « ${l.libelle} » seront perdues.`,
      )
    ) {
      dispatch({ type: 'SUPPRIMER_LOCAL', id: l.id });
    }
  }

  const boutonAjouter = (
    <button
      onClick={() => dispatch({ type: 'AJOUTER_LOCAL' })}
      disabled={!peutAjouter}
      title={
        peutAjouter
          ? 'Duplique la phase 1 commune pour un nouveau local'
          : 'Disponible une fois la qualification commune terminée'
      }
      className="rounded-sm bg-green-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-40"
    >
      + Ajouter un local sinistré
    </button>
  );

  // Un seul local : ligne compacte. On garde tout ce qui sert (nommer, ajouter) ;
  // ce qui disparaît (onglets, statut, « Retirer ») n'a pas de sens à un local.
  if (state.locaux.length === 1) {
    return (
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="nom-local-actif" className="text-sm text-ink-3">
          Local sinistré
        </label>
        <input
          id="nom-local-actif"
          ref={refNomActif}
          value={active.libelle}
          onChange={(e) =>
            dispatch({ type: 'LIBELLE_LOCAL', id: active.id, libelle: e.target.value })
          }
          aria-invalid={nomEnErreur}
          placeholder="ex. Appt 3e gauche, Cage A…"
          className={`w-56 rounded border px-2 py-1 text-sm ${
            nomEnErreur ? 'border-warn-500 bg-warn-50' : 'border-line-2'
          }`}
        />
        {boutonAjouter}
      </div>
    );
  }

  return (
    <div className="no-print mb-4 rounded-lg border border-line bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          Locaux sinistrés
        </span>
        {boutonAjouter}
      </div>
      <ul className="space-y-1">
        {state.locaux.map((l) => {
          const isActive = l.id === state.activeLocalId;
          return (
            <li key={l.id} className="flex items-center gap-2">
              <button
                onClick={() => dispatch({ type: 'ACTIVER_LOCAL', id: l.id })}
                className={`rounded px-2 py-0.5 text-xs ${
                  isActive ? 'bg-green-700 text-white' : 'bg-surface text-ink-3 hover:bg-surface-2'
                }`}
              >
                {isActive ? '●' : '○'}
              </button>
              <input
                ref={isActive ? refNomActif : undefined}
                value={l.libelle}
                onChange={(e) =>
                  dispatch({ type: 'LIBELLE_LOCAL', id: l.id, libelle: e.target.value })
                }
                aria-label="Nom du local sinistré"
                placeholder="ex. Appt 3e gauche, Cage A…"
                className={`w-48 rounded border px-2 py-0.5 text-sm ${
                  nomLocalValide(l.libelle) ? 'border-line-2' : 'border-warn-500 bg-warn-50'
                }`}
              />
              <span className="flex-1 truncate text-xs text-ink-3">{statutLocal(l)}</span>
              <button
                onClick={() => supprimer(l)}
                disabled={!peutSupprimer}
                aria-label={`Retirer le local ${l.libelle}`}
                title={
                  peutSupprimer
                    ? 'Retirer ce local sinistré'
                    : 'Un sinistre comporte au moins un local.'
                }
                className="rounded px-2 py-0.5 text-xs text-err-700 hover:bg-err-50 disabled:cursor-not-allowed disabled:text-line-2 disabled:hover:bg-transparent"
              >
                Retirer
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}