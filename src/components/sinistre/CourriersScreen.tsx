'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { courriers } from '@/lib/domain/sinistre/data';
import { creerBrouillonCourrierAction } from '@/app/sinistre/actions';
import {
  activeFields,
  canExport,
  extractConditions,
  extractFields,
  missingRequiredFields,
  render,
  type Conditions,
  type FieldValues,
} from '@/lib/domain/sinistre/engine/merge';
import { construireContexte } from '@/lib/domain/sinistre/state/courrierContext';
import { inverse } from '@/lib/domain/sinistre/engine/mapping';
import { appliquerEcriture, useDossier, useActiveLocal } from '@/lib/domain/sinistre/state/store';
import { Button, Card } from './ui';
import type { Courrier } from '@/lib/domain/sinistre/types';

/** Libellés lisibles pour quelques clés de champ techniques (sinon clé brute). */
const CHAMP_LABELS: Record<string, string> = {
  assureur_gestionnaire: 'Assureur gestionnaire',
};

function labelChamp(champ: string): string {
  return CHAMP_LABELS[champ] ?? champ;
}

function ListeCourriers() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Courriers types</h1>
      <p className="mt-1 text-sm text-ink-3">
        Modèles pré-remplis depuis le dossier en cours. Les champs inconnus sont surlignés et à
        compléter.
      </p>
      <ul className="mt-6 divide-y divide-surface-2 rounded-lg border border-line bg-surface">
        {courriers.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <span className="font-medium text-ink">
                {c.id} - {c.titre}
              </span>
              <div className="text-xs text-ink-3">
                {c.destinataire} · {c.mode_envoi} · {c.delai}
              </div>
            </div>
            <Link href={`/sinistre/courriers/${c.id}`}>
              <Button variant="secondary">Générer -</Button>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Generateur({ courrier }: { courrier: Courrier }) {
  const { state, dispatch } = useDossier();
  const local = useActiveLocal();

  const fields = useMemo(() => extractFields(courrier.gabarit), [courrier]);
  const conditionNames = useMemo(() => extractConditions(courrier.gabarit), [courrier]);

  // Contexte pré-rempli depuis le dossier, calculé une fois au montage. Le
  // composant est remonté à chaque changement de courrier (key=courrier.id côté
  // parent), donc l'initialisation suffit - pas d'effet de (ré)initialisation.
  const ctx = useMemo(
    () => construireContexte(courrier.gabarit, state, local),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [values, setValues] = useState<FieldValues>(ctx.values);
  const [conditions, setConditions] = useState<Conditions>(ctx.conditions);

  const apercu = render(courrier.gabarit, values, conditions);
  const manquants = new Set(missingRequiredFields(courrier.gabarit, values, conditions));
  const actifs = new Set(activeFields(courrier.gabarit, conditions));
  const exportable = canExport(courrier.gabarit, values, conditions);

  const objet = `${state.referenceInterne} - ${courrier.titre}`;
  const mailto = `mailto:?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(apercu)}`;

  // La saisie alimente en retour la FicheSinistre (sens inverse du mapping).
  function majChamp(champ: string, valeur: string) {
    setValues((s) => ({ ...s, [champ]: valeur }));
    const ecriture = inverse(champ, valeur, { state, local });
    if (ecriture) appliquerEcriture(dispatch, ecriture);
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(apercu);
      alert('Courrier copié dans le presse-papiers.');
    } catch {
      alert("Impossible d'accéder au presse-papiers.");
    }
  }

  // Brouillon mail neuf dans la boite du gestionnaire (ADR-028). La boite est
  // resolue serveur (session), on n'envoie ici que sujet + corps fusionnes. Repli
  // mailto conserve ci-dessous : ce bouton est un PLUS (marche en mode mail actif).
  const [brouillon, setBrouillon] = useState<{ webLink?: string; erreur?: string } | null>(null);
  const [enCours, startBrouillon] = useTransition();

  function creerBrouillon() {
    setBrouillon(null);
    startBrouillon(async () => {
      const r = await creerBrouillonCourrierAction({ sujet: objet, corps: apercu });
      if (r.ok) setBrouillon(r.webLink ? { webLink: r.webLink } : {});
      else setBrouillon({ erreur: r.erreur });
    });
  }

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/sinistre/courriers" className="text-sm text-green-700 hover:underline">
          - Tous les courriers
        </Link>
        <span className="text-xs text-ink-3">
          {courrier.destinataire} · {courrier.mode_envoi} · {courrier.delai}
        </span>
      </div>

      <h1 className="text-xl font-bold text-ink">
        {courrier.id} - {courrier.titre}
      </h1>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {/* Formulaire */}
        <div className="no-print space-y-4">
          {conditionNames.length > 0 && (
            <Card>
              <h2 className="mb-2 text-sm font-semibold text-ink-2">Blocs conditionnels</h2>
              <div className="space-y-1">
                {conditionNames.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm text-ink-2">
                    <input
                      type="checkbox"
                      checked={Boolean(conditions[c])}
                      onChange={(e) =>
                        setConditions((s) => ({ ...s, [c]: e.target.checked }))
                      }
                    />
                    {c.replace(/_/g, ' ')}
                  </label>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-ink-2">Champs</h2>
            <div className="space-y-2">
              {fields.map((f) => {
                const actif = actifs.has(f);
                const manque = manquants.has(f);
                return (
                  <label
                    key={f}
                    className={`block ${actif ? '' : 'opacity-40'}`}
                    title={actif ? '' : 'Champ inactif (bloc conditionnel désactivé)'}
                  >
                    <span className="text-xs text-ink-3">{labelChamp(f)}</span>
                    <input
                      value={values[f] ?? ''}
                      onChange={(e) => majChamp(f, e.target.value)}
                      className={`mt-0.5 w-full rounded border px-2 py-1 text-sm ${
                        manque ? 'border-warn-500 bg-warn-50' : 'border-line-2'
                      }`}
                    />
                  </label>
                );
              })}
            </div>
          </Card>

          {courrier.pieces_obligatoires && (
            <Card>
              <h2 className="mb-1 text-sm font-semibold text-ink-2">Pièces obligatoires</h2>
              <ul className="list-disc pl-5 text-sm text-ink-3">
                {courrier.pieces_obligatoires.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Aperçu temps réel */}
        <div>
          <Card className="print-container">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">
              {apercu}
            </pre>
          </Card>

          <div className="no-print mt-3 flex flex-wrap items-center gap-2">
            <Button
              onClick={copier}
              disabled={!exportable}
              title={exportable ? '' : 'Complétez les champs requis surlignés'}
            >
              Copier
            </Button>
            <Button
              variant="secondary"
              onClick={() => window.print()}
              disabled={!exportable}
              title={exportable ? '' : 'Complétez les champs requis surlignés'}
            >
              Imprimer
            </Button>
            <Button
              variant="secondary"
              onClick={creerBrouillon}
              disabled={!exportable || enCours}
              title={exportable ? '' : 'Complétez les champs requis surlignés'}
            >
              {enCours ? 'Création...' : 'Créer le brouillon dans ma boîte'}
            </Button>
            <a href={mailto}>
              <Button variant="ghost">Ouvrir dans la messagerie (mailto)</Button>
            </a>
            {!exportable && (
              <span className="text-xs text-warn-700">
                {manquants.size} champ(s) requis à compléter.
              </span>
            )}
          </div>

          {brouillon && (
            <p className="no-print mt-2 text-xs">
              {brouillon.erreur ? (
                <span className="text-warn-700">{brouillon.erreur}</span>
              ) : brouillon.webLink ? (
                <span className="text-green-700">
                  Brouillon créé dans votre boîte.{' '}
                  <a
                    href={brouillon.webLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Ouvrir dans Outlook
                  </a>
                </span>
              ) : (
                <span className="text-green-700">Brouillon créé dans votre boîte.</span>
              )}
            </p>
          )}

          {courrier.references && (
            <p className="mt-3 text-xs text-ink-4">Références : {courrier.references.join(' · ')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function CourriersScreen({ courrierId }: { courrierId?: string }) {
  const courrier = courriers.find((c) => c.id === courrierId);
  // key=courrier.id : remonte le générateur (et réinitialise ses champs) quand
  // on passe d'un courrier à l'autre.
  if (courrierId && courrier) return <Generateur key={courrier.id} courrier={courrier} />;
  return <ListeCourriers />;
}
