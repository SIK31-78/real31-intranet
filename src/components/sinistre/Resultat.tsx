'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Glose } from './Glossaire';
import { Button, GlosedList, SectionTitle } from './ui';
import { courriersRecommandes, resultatNode } from '@/lib/domain/sinistre/engine/wizard';
import {
  expliquerGestionnaire,
  type ExplicationGestionnaire,
} from '@/lib/domain/sinistre/engine/explication';
import { syntheseDossierSinistre } from '@/lib/domain/sinistre/engine/synthese';
import { useDossier, useActiveLocal } from '@/lib/domain/sinistre/state/store';
import { reporterRdvExpertiseAction, reporterSyntheseSinistreAction } from '@/app/dossiers/actions';
import { ajouterRdvAgendaAction, genererEtapesSinistreAction } from '@/app/sinistre/actions';
import { ListeCourriersLiens } from './CourriersLiens';
import type { ResultatNode } from '@/lib/domain/sinistre/types';

const TRANCHE_LABEL: Record<string, string> = {
  tranche_1: 'tranche 1',
  tranche_2: 'tranche 2',
  hors_irsi: 'hors IRSI (> plafond convention)',
};

/**
 * Transparence de la désignation (retour Sekou : « on ne sait pas comment est
 * déterminé l'assureur gestionnaire »). On restitue ce que le moteur SAIT déjà :
 * la règle appliquée (références du nœud) et les réponses du parcours qui y ont
 * mené. Rien n'est reconstruit ni deviné ici : tout vient de `expliquerGestionnaire`.
 */
function PourquoiCeGestionnaire({ explication }: { explication: ExplicationGestionnaire }) {
  const { gestionnaire, cas213, references, motifs, tranche, provisoire, role } = explication;

  return (
    <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4">
      <p className="text-xs uppercase tracking-wide text-green-700">Assureur gestionnaire</p>
      <p className="text-lg font-semibold text-green-900">{gestionnaire.replace(/_/g, ' ')}</p>

      <p className="mt-3 text-sm font-medium text-green-900">Pourquoi cet assureur ?</p>
      <ul className="mt-1 space-y-1 text-sm text-green-900">
        {motifs.map((m, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="text-green-700">
              •
            </span>
            <span>
              <span className="text-green-700">{m.question}</span>{' '}
              <span className="font-medium">{m.reponse}</span>
            </span>
          </li>
        ))}
        {cas213 !== undefined && (
          <li className="flex gap-2">
            <span aria-hidden className="text-green-700">
              •
            </span>
            <span>
              Ces réponses correspondent au{' '}
              <span className="font-medium">cas {cas213} du tableau IRSI 2.1.3</span>, qui
              désigne cet assureur.
            </span>
          </li>
        )}
        {tranche && (
          <li className="flex gap-2">
            <span aria-hidden className="text-green-700">
              •
            </span>
            <span className="text-green-700">
              Contexte (sans effet sur la désignation) : {TRANCHE_LABEL[tranche] ?? tranche}.
            </span>
          </li>
        )}
      </ul>

      {role && (
        <p className="mt-3 text-[13px] text-green-800">
          <span className="font-medium">Son rôle : </span>
          <Glose>{role}</Glose>
        </p>
      )}

      {references.length > 0 && (
        <p className="mt-2 text-xs text-green-700">Règle appliquée : {references.join(' · ')}</p>
      )}

      {provisoire && (
        <p className="mt-3 rounded border-l-4 border-warn-500 bg-warn-50 p-2 text-[13px] text-warn-700">
          Désignation <strong>provisoire</strong> : elle repose sur un « Je ne sais pas » et non
          sur un défaut d’assurance constaté. Obtenez l’attestation (courrier C5) puis reprenez la
          question d’assurance.
        </p>
      )}
    </div>
  );
}

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

  // Ajout des RDV d'expertise a l'agenda Outlook reel (voie durable Graph). Payload
  // construit depuis les memes RDV agreges des locaux : date + lieu + un intitule
  // lisible (immeuble/copro + local). INERTE tant que le DSI n'a pas accorde
  // Calendars.ReadWrite -> l'action renvoie le message degrade, on l'affiche.
  const rdvsAgenda = state.locaux.flatMap((l) =>
    (l.rendezVousExpertise ?? []).map((r) => {
      const contexte = [state.immeuble.nom, l.libelle].filter(Boolean).join(' - ');
      const intitule = contexte ? `Expertise sinistre - ${contexte}` : 'Expertise sinistre';
      return {
        date: r.date,
        ...(r.lieu ? { lieu: r.lieu } : {}),
        intitule,
      };
    }),
  );
  const [pendingAgenda, startAgendaTransition] = useTransition();
  const [agendaMessage, setAgendaMessage] = useState<string | null>(null);
  const [agendaWebLink, setAgendaWebLink] = useState<string | null>(null);

  const ajouterAgenda = () => {
    if (rdvsAgenda.length === 0) return;
    startAgendaTransition(async () => {
      const res = await ajouterRdvAgendaAction({ rdvs: rdvsAgenda });
      if (!res.ok) {
        setAgendaMessage(res.erreur);
        setAgendaWebLink(null);
      } else {
        setAgendaMessage(`${res.ajoutes} RDV ajouté${res.ajoutes > 1 ? 's' : ''} à votre agenda Outlook.`);
        setAgendaWebLink(res.webLink ?? null);
      }
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

  // « On ne sait pas comment est déterminé l'assureur gestionnaire » : le moteur
  // connaît le chemin parcouru, on l'expose (règle appliquée + réponses qui y ont mené).
  const explication = expliquerGestionnaire(wizard);
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

      {rdvsAgenda.length > 0 && (
        <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-indigo-200 bg-indigo-50 p-3 text-sm">
          {agendaMessage ? (
            <span className="font-medium text-indigo-900">
              {agendaMessage}
              {agendaWebLink && (
                <>
                  {' '}
                  <a
                    href={agendaWebLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-indigo-700 underline hover:text-indigo-900"
                  >
                    Ouvrir dans Outlook
                  </a>
                </>
              )}
            </span>
          ) : (
            <span className="text-indigo-900">
              Ajouter {rdvsAgenda.length > 1 ? `les ${rdvsAgenda.length} rendez-vous` : 'le rendez-vous'} d&apos;expertise à votre agenda Outlook.
            </span>
          )}
          {!agendaMessage && (
            <Button variant="primary" onClick={ajouterAgenda} disabled={pendingAgenda}>
              {pendingAgenda ? 'Ajout en cours…' : 'Ajouter les RDV à mon agenda Outlook'}
            </Button>
          )}
        </div>
      )}

      {explication && <PourquoiCeGestionnaire explication={explication} />}

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
