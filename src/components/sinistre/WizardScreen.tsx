'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useDossier, useActiveLocal } from '@/lib/domain/sinistre/state/store';
import { currentNode, isTransparent, cheminMixte, pathOf } from '@/lib/domain/sinistre/engine/wizard';
import { aujourdhuiISO, dateEstFuture } from '@/lib/domain/sinistre/util/date';
import { nomLocalValide } from '@/lib/domain/sinistre/util/local';
import { Breadcrumb } from './Breadcrumb';
import { LocauxBar } from './LocauxBar';
import { QuestionView } from './QuestionView';
import { EtapeView } from './EtapeView';
import { Resultat } from './Resultat';
import { Button, Card } from './ui';

// INCRÉMENT 1 (read-only) : saisie immeuble en texte libre uniquement ; pas de
// sélecteur Supabase ni de bouton « Enregistrer » (la persistance arrive plus tard).
function DossierPanel() {
  const { state, dispatch } = useDossier();
  const [ouvert, setOuvert] = useState(true);

  return (
    <Card className="no-print mb-4">
      <button
        onClick={() => setOuvert((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-semibold text-ink-2">
          Dossier {state.referenceInterne}
          {state.immeuble.nom ? ` - ${state.immeuble.nom}` : ''}
        </span>
        <span className="text-ink-4">{ouvert ? '▲' : '▼'}</span>
      </button>

      {ouvert && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-ink-3">Référence interne</span>
            <output className="mt-1 block w-full rounded border border-line bg-surface-2 px-2 py-1 text-ink-2">
              {state.referenceInterne || '(attribuée à l’enregistrement)'}
            </output>
          </label>
          <label className="text-sm">
            <span className="text-ink-3">Date du sinistre</span>
            <input
              type="date"
              value={state.date}
              max={aujourdhuiISO()}
              onChange={(e) => dispatch({ type: 'META', patch: { date: e.target.value } })}
              className={`mt-1 w-full rounded border px-2 py-1 ${
                dateEstFuture(state.date) ? 'border-warn-500 bg-warn-50' : 'border-line-2'
              }`}
            />
            {dateEstFuture(state.date) && (
              <span className="text-xs text-warn-700">
                La date du sinistre ne peut pas être dans le futur
              </span>
            )}
          </label>
          <label className="text-sm">
            <span className="text-ink-3">Immeuble - nom</span>
            <input
              value={state.immeuble.nom}
              onChange={(e) => dispatch({ type: 'IMMEUBLE', patch: { nom: e.target.value } })}
              className="mt-1 w-full rounded border border-line-2 px-2 py-1"
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-3">Immeuble - adresse</span>
            <input
              value={state.immeuble.adresse}
              onChange={(e) => dispatch({ type: 'IMMEUBLE', patch: { adresse: e.target.value } })}
              className="mt-1 w-full rounded border border-line-2 px-2 py-1"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-ink-3">Descriptif</span>
            <textarea
              value={state.descriptif}
              onChange={(e) => dispatch({ type: 'META', patch: { descriptif: e.target.value } })}
              rows={2}
              className="mt-1 w-full rounded border border-line-2 px-2 py-1"
            />
          </label>
        </div>
      )}
    </Card>
  );
}

/** Messages bloquant la progression du parcours (G-2, G-4). */
function blocagesProgression(date: string, nomLocal: string): string[] {
  const msgs: string[] = [];
  if (dateEstFuture(date)) msgs.push('La date du sinistre ne peut pas être dans le futur.');
  if (!nomLocalValide(nomLocal)) msgs.push('Donnez un nom à ce local pour continuer.');
  return msgs;
}

export function WizardScreen() {
  const { state, dispatch } = useDossier();
  const local = useActiveLocal();
  const node = currentNode(local.wizard);
  const peutReculer = local.wizard.steps.length > 0;

  const dossierId = useSearchParams().get('dossier');

  const blocages = blocagesProgression(state.date, local.libelle);
  const bloque = blocages.length > 0;

  // Filet de sécurité (G-3) : si l'on atterrit sur une étape transparente
  // (ex. brouillon réhydraté), la franchir sans l'afficher.
  const transparent = isTransparent(node);
  useEffect(() => {
    if (transparent) dispatch({ type: 'ADVANCE' });
  }, [transparent, dispatch]);
  if (transparent) return null;

  return (
    <div>
      {dossierId && (
        <div className="no-print mb-4 flex items-center justify-between gap-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          <span>Analyse rattachée à un dossier · la synthèse pourra y être reportée depuis l’écran de résultat.</span>
          <Link href={`/dossiers/${dossierId}`} className="shrink-0 font-medium underline hover:text-green-700">
            Revenir au dossier
          </Link>
        </div>
      )}
      <DossierPanel />
      <Breadcrumb node={node} />
      <LocauxBar />

      {/* G-5 : sinistre mixte - rappeler la part commune et proposer le raccourci. */}
      {cheminMixte(local.wizard) && node.type !== 'resultat' && (
        <div className="no-print mb-4 rounded-md border-l-4 border-info-500 bg-info-50 p-3 text-sm text-info-700">
          <p>
            <span className="font-medium">Sinistre mixte. </span>
            La part commune relève de l&apos;assureur de l&apos;immeuble (art. 2.1) ; suivez-la dans un local
            dédié pour une gestion propre.
          </p>
          {state.locaux.some((l) => pathOf(l.wizard).includes('r_gest_immeuble_communs')) ? (
            <p className="mt-2 text-xs text-info-700">Local « Parties communes » ajouté.</p>
          ) : (
            <div className="mt-2">
              <Button
                variant="secondary"
                onClick={() => dispatch({ type: 'AJOUTER_LOCAL_COMMUNS' })}
              >
                + Ajouter le local « Parties communes »
              </Button>
            </div>
          )}
        </div>
      )}

      {bloque && node.type !== 'resultat' && (
        <div
          role="alert"
          className="no-print mb-4 rounded-md border-l-4 border-warn-500 bg-warn-50 p-3 text-sm text-warn-700"
        >
          <p className="font-medium">Corrigez avant de continuer :</p>
          <ul className="list-disc pl-5">
            {blocages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        {node.type === 'question' && (
          <QuestionView
            node={node}
            nodeId={local.wizard.current}
            onAnswer={(i) => dispatch({ type: 'ANSWER', optionIndex: i })}
            disabled={bloque}
          />
        )}
        {node.type === 'etape' && (
          <EtapeView
            node={node}
            onContinue={() => dispatch({ type: 'ADVANCE' })}
            disabled={bloque}
          />
        )}
        {node.type === 'resultat' && <Resultat />}
      </Card>

      {peutReculer && (
        <div className="no-print mt-4">
          <Button variant="ghost" onClick={() => dispatch({ type: 'BACK' })}>
            - Précédent
          </Button>
        </div>
      )}
    </div>
  );
}
