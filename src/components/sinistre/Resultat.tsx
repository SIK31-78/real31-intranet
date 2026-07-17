'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Glose } from './Glossaire';
import { GlosedList, SectionTitle } from './ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { resultatNode } from '@/lib/domain/sinistre/engine/wizard';
import { planifierCourriers } from '@/lib/domain/sinistre/engine/plan-courriers';
import {
  expliquerGestionnaire,
  type ExplicationGestionnaire,
} from '@/lib/domain/sinistre/engine/explication';
import { syntheseDossierSinistre } from '@/lib/domain/sinistre/engine/synthese';
import { useDossier, useActiveLocal } from '@/lib/domain/sinistre/state/store';
import { reporterRdvExpertiseAction, reporterSyntheseSinistreAction } from '@/app/dossiers/actions';
import { ajouterRdvAgendaAction, genererEtapesSinistreAction } from '@/app/sinistre/actions';
import { PlanCourriersVue } from './CourriersLiens';
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
 *
 * REPLIÉ par défaut : c'est du contexte, pas une action. La réponse (« quel
 * assureur ») reste toujours visible au-dessus ; seul le raisonnement se plie.
 */
function PourquoiCeGestionnaire({ explication }: { explication: ExplicationGestionnaire }) {
  const { gestionnaire, cas213, references, motifs, tranche, provisoire, role } = explication;

  return (
    <Card className="mt-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">
          Assureur gestionnaire
        </span>
        <span className="text-[15px] font-semibold text-ink">{gestionnaire.replace(/_/g, ' ')}</span>
        {tranche && <Badge ton="neutral">{TRANCHE_LABEL[tranche] ?? tranche}</Badge>}
        {provisoire && (
          <Badge ton="warn" dot>
            Provisoire
          </Badge>
        )}
      </div>

      {provisoire && (
        <p
          role="note"
          className="mt-3 rounded-md border-l-4 border-warn-500 bg-warn-50 p-2 text-[13px] text-warn-700"
        >
          Désignation <strong>provisoire</strong> : elle repose sur un « Je ne sais pas » et non
          sur un défaut d’assurance constaté. Obtenez l’attestation (courrier C5) puis reprenez la
          question d’assurance.
        </p>
      )}

      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-[13px] font-medium text-ink-2 marker:content-none hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
          <span
            aria-hidden
            className="mr-1.5 inline-block text-ink-4 transition-transform group-open:rotate-90"
          >
            ▸
          </span>
          Pourquoi cet assureur ?
        </summary>

        <ul className="mt-2 space-y-1 text-[13px] text-ink-2">
          {motifs.map((m, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="text-ink-4">
                •
              </span>
              <span>
                <span className="text-ink-3">{m.question}</span>{' '}
                <span className="font-medium text-ink">{m.reponse}</span>
              </span>
            </li>
          ))}
          {cas213 !== undefined && (
            <li className="flex gap-2">
              <span aria-hidden className="text-ink-4">
                •
              </span>
              <span>
                Ces réponses correspondent au{' '}
                <span className="font-medium text-ink">cas {cas213} du tableau IRSI 2.1.3</span>,
                qui désigne cet assureur.
              </span>
            </li>
          )}
          {tranche && (
            <li className="flex gap-2">
              <span aria-hidden className="text-ink-4">
                •
              </span>
              <span className="text-ink-3">
                Contexte (sans effet sur la désignation) : {TRANCHE_LABEL[tranche] ?? tranche}.
              </span>
            </li>
          )}
        </ul>

        {role && (
          <p className="mt-3 text-[13px] text-ink-2">
            <span className="font-medium">Son rôle : </span>
            <Glose>{role}</Glose>
          </p>
        )}

        {references.length > 0 && (
          <p className="mt-2 text-xs text-ink-4">Règle appliquée : {references.join(' · ')}</p>
        )}
      </details>
    </Card>
  );
}

/**
 * Une action de report vers le dossier. Toutes ces actions partagent la même
 * forme (une phrase, un bouton, un accusé) : une seule ligne sobre chacune, au
 * lieu de quatre bandeaux de couleurs différentes qui écrasaient le résultat.
 */
function LigneAction({
  texte,
  fait,
  echec = false,
  bouton,
  onClick,
  pending,
  children,
}: {
  texte: string;
  fait?: string | null;
  /** Le retour est un échec : on ne le peint pas en « fait ». */
  echec?: boolean;
  bouton: string;
  onClick: () => void;
  pending: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      {fait ? (
        <span
          role="status"
          className={`text-[13px] font-medium ${echec ? 'text-warn-700' : 'text-ok-700'}`}
        >
          {fait}
          {children}
        </span>
      ) : (
        <>
          <span className="text-[13px] text-ink-2">{texte}</span>
          <Button variant="secondary" onClick={onClick} disabled={pending}>
            {pending ? 'En cours…' : bouton}
          </Button>
        </>
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
  const [agendaEchec, setAgendaEchec] = useState(false);
  const [agendaWebLink, setAgendaWebLink] = useState<string | null>(null);

  const ajouterAgenda = () => {
    if (rdvsAgenda.length === 0) return;
    startAgendaTransition(async () => {
      const res = await ajouterRdvAgendaAction({ rdvs: rdvsAgenda });
      setAgendaEchec(!res.ok);
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
  const [etapesEchec, setEtapesEchec] = useState(false);

  const genererEtapes = () => {
    if (!dossierId) return;
    startEtapesTransition(async () => {
      const res = await genererEtapesSinistreAction(dossierId, state);
      setEtapesEchec(!res.ok);
      if (!res.ok) setEtapesMessage('Erreur lors de la génération.');
      else if (res.ajoutees === 0) setEtapesMessage('Aucune nouvelle étape à ajouter.');
      else setEtapesMessage(`${res.ajoutees} étape${res.ajoutees > 1 ? 's' : ''} ajoutée${res.ajoutees > 1 ? 's' : ''} au dossier.`);
    });
  };

  // « On ne sait pas comment est déterminé l'assureur gestionnaire » : le moteur
  // connaît le chemin parcouru, on l'expose (règle appliquée + réponses qui y ont mené).
  const explication = expliquerGestionnaire(wizard);

  // Le résultat n'est plus un catalogue de modèles : c'est un plan. Le domaine
  // partitionne (jour J / suites conditionnelles), l'écran ne fait qu'afficher.
  const plan = planifierCourriers(wizard);

  const actions = dossierId || rdvsAgenda.length > 0;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Synthèse</p>
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

      {explication && <PourquoiCeGestionnaire explication={explication} />}

      {/* Le cœur de l'écran : ce qui part aujourd'hui, et ce qui attend. */}
      <PlanCourriersVue plan={plan} />

      {node.prise_en_charge && (
        <div className="mt-6">
          <SectionTitle>Règles de prise en charge</SectionTitle>
          <GlosedList items={node.prise_en_charge} className="mt-1" />
        </div>
      )}

      {node.recours && (
        <div className="mt-4">
          <SectionTitle>Recours</SectionTitle>
          <GlosedList items={[node.recours]} className="mt-1" />
        </div>
      )}

      {/* Reports vers le dossier / l'agenda : utiles, mais ce ne sont pas les
          gestes du jour J - ils passent SOUS le plan, en lignes sobres. */}
      {actions && (
        <div className="no-print mt-6">
          <SectionTitle>Reporter dans le dossier</SectionTitle>
          <Card className="mt-2 divide-y divide-line">
            {dossierId && (
              <LigneAction
                texte="Reporter cette synthèse (résultat, gestionnaire, tranche, courriers) dans le journal du dossier."
                fait={reporte ? 'Synthèse reportée dans le dossier' : null}
                bouton="Reporter la synthèse"
                onClick={reporterDansDossier}
                pending={pending}
              />
            )}
            {dossierId && (
              <LigneAction
                texte="Générer les étapes du dossier (courriers recommandés, jalons) depuis ce parcours. N’écrase aucune étape existante."
                fait={etapesMessage}
                echec={etapesEchec}
                bouton="Générer les étapes"
                onClick={genererEtapes}
                pending={pendingEtapes}
              />
            )}
            {dossierId && rdvsPayload.length > 0 && (
              <LigneAction
                texte={`Reporter ${rdvsPayload.length > 1 ? `les ${rdvsPayload.length} rendez-vous` : 'le rendez-vous'} d'expertise dans le journal du dossier.`}
                fait={
                  rdvReportes
                    ? `${rdvsPayload.length > 1 ? 'Rendez-vous d’expertise reportés' : 'Rendez-vous d’expertise reporté'} dans le dossier`
                    : null
                }
                bouton="Reporter les RDV d’expertise"
                onClick={reporterRdvDansDossier}
                pending={pendingRdv}
              />
            )}
            {rdvsAgenda.length > 0 && (
              <LigneAction
                texte={`Ajouter ${rdvsAgenda.length > 1 ? `les ${rdvsAgenda.length} rendez-vous` : 'le rendez-vous'} d'expertise à votre agenda Outlook.`}
                fait={agendaMessage}
                echec={agendaEchec}
                bouton="Ajouter à mon agenda Outlook"
                onClick={ajouterAgenda}
                pending={pendingAgenda}
              >
                {agendaWebLink && (
                  <>
                    {' '}
                    <a
                      href={agendaWebLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-green-700 underline hover:text-green-600"
                    >
                      Ouvrir dans Outlook
                    </a>
                  </>
                )}
              </LigneAction>
            )}
            {dossierId && (
              <div className="px-4 py-3">
                <Link
                  href={`/dossiers/${dossierId}`}
                  className="text-[13px] font-medium text-green-700 underline hover:text-green-600"
                >
                  Revenir au dossier
                </Link>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
