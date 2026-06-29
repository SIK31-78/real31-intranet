'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Glose } from './Glossaire';
import { Button, GlosedList, SectionTitle } from './ui';
import {
  cas213,
  courriersRecommandes,
  gestionnaireNode,
  resultatNode,
} from '@/lib/domain/sinistre/engine/wizard';
import { syntheseDossierSinistre } from '@/lib/domain/sinistre/engine/synthese';
import { useDossier, useActiveLocal } from '@/lib/domain/sinistre/state/store';
import { reporterRdvExpertiseAction, reporterSyntheseSinistreAction } from '@/app/dossiers/actions';
import { genererEtapesSinistreAction } from '@/app/sinistre/actions';
import { ListeCourriersLiens } from './CourriersLiens';
import type { ResultatNode } from '@/lib/domain/sinistre/types';

export function Resultat() {
  const { state } = useDossier();
  const local = useActiveLocal();
  const wizard = local.wizard;
  const node = resultatNode(wizard) as ResultatNode;

  // Contexte dossier (incrément 2) : si on est arrivé via /sinistre/wizard?dossier=<id>,
  // on propose de reporter la synthèse dans le journal de ce dossier.
  const dossierId = useSearchParams().get('dossier');
  const [pending, startTransition] = useTransition();
  const [reporte, setReporte] = useState(false);

  const reporterDansDossier = () => {
    if (!dossierId) return;
    const texte = syntheseDossierSinistre(state);
    startTransition(async () => {
      await reporterSyntheseSinistreAction(dossierId, texte);
      setReporte(true);
    });
  };

  // RDV d'expertise notés sur l'ensemble des locaux (H-3). Jusqu'ici prisonniers
  // du localStorage du wizard : on propose de les reporter dans le journal du dossier.
  const rdvsPayload = state.locaux.flatMap((l) =>
    (l.rendezVousExpertise ?? []).map((r) => ({
      date: r.date,
      ...(r.lieu ? { lieu: r.lieu } : {}),
      convoquePar: r.convoquePar,
      ...(r.precisionConvocant ? { precisionConvocant: r.precisionConvocant } : {}),
      ...(l.libelle ? { local: l.libelle } : {}),
    })),
  );
  const [pendingRdv, startRdvTransition] = useTransition();
  const [rdvReportes, setRdvReportes] = useState(false);

  const reporterRdvDansDossier = () => {
    if (!dossierId || rdvsPayload.length === 0) return;
    startRdvTransition(async () => {
      await reporterRdvExpertiseAction(dossierId, rdvsPayload);
      setRdvReportes(true);
    });
  };

  // Generation des etapes du dossier depuis le parcours (incrément 5). On envoie
  // l'etat complet : la projection se fait cote SERVEUR (le client ne fabrique pas
  // la liste d'etapes). Retour minimal (genere N / rien a ajouter / erreur).
  const [pendingEtapes, startEtapesTransition] = useTransition();
  const [etapesMessage, setEtapesMessage] = useState<string | null>(null);

  const genererEtapes = () => {
    if (!dossierId) return;
    startEtapesTransition(async () => {
      const res = await genererEtapesSinistreAction(dossierId, state);
      if (!res.ok) setEtapesMessage('Erreur lors de la génération.');
      else if (res.ajoutees === 0) setEtapesMessage('Aucune nouvelle étape à ajouter.');
      else setEtapesMessage(`${res.ajoutees} étape${res.ajoutees > 1 ? 's' : ''} ajoutée${res.ajoutees > 1 ? 's' : ''} au dossier.`);
    });
  };

  const gest = gestionnaireNode(wizard);
  const cas = cas213(wizard);
  const recommandes = courriersRecommandes(wizard);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-green-900">Synthèse</p>
          <h2 className="text-2xl font-bold text-ink">
            <Glose>{node.titre}</Glose>
          </h2>
          <p className="mt-1 text-sm text-ink-3">
            {state.referenceInterne} · {local.libelle}
            {state.immeuble.nom ? ` · ${state.immeuble.nom}` : ''}
          </p>
        </div>
        <div className="no-print flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            Imprimer / PDF
          </Button>
        </div>
      </div>

      {dossierId && (
        <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm">
          {reporte ? (
            <span className="font-medium text-green-900">Synthèse reportée dans le dossier</span>
          ) : (
            <span className="text-green-900">
              Reporter cette synthèse (résultat, gestionnaire, tranche, courriers) dans le journal du dossier.
            </span>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {!reporte && (
              <Button variant="primary" onClick={reporterDansDossier} disabled={pending}>
                {pending ? 'Report en cours…' : 'Reporter la synthèse dans le dossier'}
              </Button>
            )}
            <Link
              href={`/dossiers/${dossierId}`}
              className="text-[13px] font-medium text-green-700 underline hover:text-green-900"
            >
              Revenir au dossier
            </Link>
          </div>
        </div>
      )}

      {dossierId && (
        <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm">
          {etapesMessage ? (
            <span className="font-medium text-sky-900">{etapesMessage}</span>
          ) : (
            <span className="text-sky-900">
              Générer les étapes du dossier (courriers recommandés, jalons) depuis ce parcours. N&apos;écrase aucune étape existante.
            </span>
          )}
          {!etapesMessage && (
            <Button variant="primary" onClick={genererEtapes} disabled={pendingEtapes}>
              {pendingEtapes ? 'Génération en cours…' : 'Générer les étapes depuis le parcours'}
            </Button>
          )}
        </div>
      )}

      {dossierId && rdvsPayload.length > 0 && (
        <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
          {rdvReportes ? (
            <span className="font-medium text-amber-900">
              {rdvsPayload.length > 1 ? 'Rendez-vous d’expertise reportés' : 'Rendez-vous d’expertise reporté'} dans le dossier
            </span>
          ) : (
            <span className="text-amber-900">
              Reporter {rdvsPayload.length > 1 ? `les ${rdvsPayload.length} rendez-vous` : 'le rendez-vous'} d&apos;expertise dans le journal du dossier.
            </span>
          )}
          {!rdvReportes && (
            <Button variant="primary" onClick={reporterRdvDansDossier} disabled={pendingRdv}>
              {pendingRdv ? 'Report en cours…' : 'Reporter les RDV d’expertise dans le dossier'}
            </Button>
          )}
        </div>
      )}

      {gest && (
        <div className="mt-4 rounded-md border border-green-100 bg-green-50 p-3 text-sm">
          <span className="font-semibold text-green-900">Assureur gestionnaire : </span>
          <span className="text-green-900">{gest.gestionnaire?.replace(/_/g, ' ')}</span>
          {cas !== undefined && (
            <span className="text-green-700"> - cas {cas} du tableau IRSI 2.1.3</span>
          )}
        </div>
      )}

      {node.prise_en_charge && (
        <div className="mt-4">
          <SectionTitle>Règles de prise en charge</SectionTitle>
          <GlosedList items={node.prise_en_charge} />
        </div>
      )}

      {node.recours && (
        <div className="mt-4">
          <SectionTitle>Recours</SectionTitle>
          <GlosedList items={[node.recours]} />
        </div>
      )}

      {/* Bloc « Modèles de mails ou courriers recommandés ». */}
      <ListeCourriersLiens ids={recommandes} />
    </div>
  );
}
