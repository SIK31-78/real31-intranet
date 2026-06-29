'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Glose } from './Glossaire';
import { Button, GlosedList, References, SectionTitle } from './ui';
import {
  actionsSyndic,
  cas213,
  courriersRecommandes,
  gestionnaireNode,
  getNode,
  reponses,
  resultatNode,
} from '@/lib/domain/sinistre/engine/wizard';
import { syntheseDossierSinistre } from '@/lib/domain/sinistre/engine/synthese';
import { nodes } from '@/lib/domain/sinistre/data';
import { useDossier, useActiveLocal } from '@/lib/domain/sinistre/state/store';
import { reporterSyntheseSinistreAction } from '@/app/dossiers/actions';
import { MesureRow } from './ChecklistMesures';
import { ListeCourriersLiens } from './CourriersLiens';
import { EncartVigilance } from './PointsVigilance';
import { BlocRendezVousExpertise } from './RendezVousExpertise';
import { estActionGestionnaire } from '@/lib/domain/sinistre/util/responsable';
import type { ChecklistItem, LocalSinistre, MesureEtat, PointVigilance, ResultatNode } from '@/lib/domain/sinistre/types';

/** Points de vigilance cochés sur ce local (rappel en synthèse, G-6). */
function pointsVigilanceCoches(local: LocalSinistre): PointVigilance[] {
  const n = nodes['q_tranche'];
  const points = n && n.type === 'question' ? (n.points_vigilance ?? []) : [];
  const etats = local.pointsVigilance ?? {};
  return points.filter((p) => etats[p.id] === true);
}

function checklistUrgence(): ChecklistItem[] {
  const urgence = nodes['etape_urgence'];
  return urgence && urgence.type === 'etape' ? (urgence.checklist ?? []) : [];
}

/** Démarches à demander aux parties (phase « demarches »), affichées en synthèse (F-1). */
export function demarchesAParties(): ChecklistItem[] {
  return checklistUrgence().filter((item) => item.phase === 'demarches');
}

/**
 * Items restés « à faire » (ni Fait ni Sans objet), TOUTES phases confondues :
 * un geste d'urgence oublié doit toujours remonter en synthèse.
 */
export function mesuresNonRealisees(
  mesures: Record<string, MesureEtat> | undefined,
): ChecklistItem[] {
  const etats = mesures ?? {};
  return checklistUrgence().filter((item) => {
    const e = etats[item.id];
    return e !== 'fait' && e !== 'sans_objet';
  });
}

function Texte({ title, value }: { title: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="mt-4">
      <SectionTitle>{title}</SectionTitle>
      <p className="whitespace-pre-line text-sm text-ink-2">
        <Glose>{value}</Glose>
      </p>
    </div>
  );
}

function exporterDossier(ref: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ref || 'dossier-sinistre'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function Resultat() {
  const { state, dispatch } = useDossier();
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

  const gest = gestionnaireNode(wizard);
  const cas = cas213(wizard);
  const actions = actionsSyndic(wizard);
  const recommandes = courriersRecommandes(wizard);
  const nonRealisees = mesuresNonRealisees(local.mesures);
  const demarches = demarchesAParties();
  const vigilances = pointsVigilanceCoches(local);
  const ecranExpertise = local.wizard.current === 'r_t2' || local.wizard.current === 'r_cidecop';

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-green-900">Synthèse — {node.phase}</p>
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
          <Button variant="ghost" onClick={() => exporterDossier(state.referenceInterne, state)}>
            Exporter le dossier
          </Button>
        </div>
      </div>

      {dossierId && (
        <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm">
          {reporte ? (
            <span className="font-medium text-green-900">Synthèse reportée dans le dossier ✓</span>
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

      {gest && (
        <div className="mt-4 rounded-md border border-green-100 bg-green-50 p-3 text-sm">
          <span className="font-semibold text-green-900">Assureur gestionnaire : </span>
          <span className="text-green-900">{gest.gestionnaire?.replace(/_/g, ' ')}</span>
          {cas !== undefined && (
            <span className="text-green-700"> — cas {cas} du tableau IRSI 2.1.3</span>
          )}
        </div>
      )}

      {/* Rappel des points de vigilance cochés (ex. parquet/Titre 10) — G-6. */}
      {vigilances.length > 0 && (
        <div className="mt-4">
          <SectionTitle>Points de vigilance</SectionTitle>
          {vigilances.map((p) => (
            <EncartVigilance key={p.id} point={p} />
          ))}
        </div>
      )}

      <Texte title="Évaluation" value={node.evaluation} />
      <Texte title="Spécificité" value={node.specificite} />
      <Texte title="Renvoi" value={node.renvoi} />
      <Texte title="Conduite à tenir" value={node.conduite} />

      {node.prise_en_charge && (
        <div className="mt-4">
          <SectionTitle>Règles de prise en charge</SectionTitle>
          <GlosedList items={node.prise_en_charge} />
        </div>
      )}

      <Texte title="Recours" value={node.recours} />
      <Texte title="Expertise" value={node.expertise} />
      <Texte title="Concertation" value={node.concertation} />

      {node.bareme_dde && (
        <div className="mt-4">
          <SectionTitle>Barème dégât des eaux (Annexe 1)</SectionTitle>
          <dl className="space-y-2 text-sm">
            {Object.entries(node.bareme_dde).map(([key, value]) => (
              <div key={key}>
                <dt className="font-medium text-ink-2">{key.replace(/_/g, ' ')}</dt>
                <dd className="text-ink-3">
                  <Glose>{value}</Glose>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Rappel : mesures d'urgence restées « à faire » (C-1/D-1), réparties par
          responsable pour que le gestionnaire ne s'attribue pas les tâches des tiers. */}
      {nonRealisees.length > 0 && (
        <div className="mt-6 rounded-lg border-l-4 border-err-500 bg-err-50 p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-err-700">
            Mesures non réalisées
          </h3>
          {(() => {
            const duGestionnaire = nonRealisees.filter((m) => estActionGestionnaire(m.responsable));
            const desTiers = nonRealisees.filter((m) => !estActionGestionnaire(m.responsable));
            return (
              <div className="space-y-3 text-sm text-err-700">
                <p className="text-xs">
                  Cochez les actions réalisées : elles disparaissent de la liste (état partagé avec
                  l’étape d’urgence).
                </p>
                {duGestionnaire.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">À faire par le gestionnaire</p>
                    <ul className="space-y-2">
                      {duGestionnaire.map((m) => (
                        <MesureRow key={m.id} item={m} />
                      ))}
                    </ul>
                  </div>
                )}
                {desTiers.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">À demander à l’occupant / propriétaire</p>
                    <ul className="space-y-2">
                      {desTiers.map((m) => (
                        <MesureRow key={m.id} item={m} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Rendez-vous d'expertise (H-3) — uniquement sur les écrans d'expertise. */}
      {ecranExpertise && <BlocRendezVousExpertise />}

      {/* Bloc « Vos actions » — concaténation des actions_syndic du chemin. */}
      {actions.length > 0 && (
        <div className="mt-6 rounded-lg border border-line bg-surface p-4">
          <SectionTitle>Vos actions</SectionTitle>
          <ul className="space-y-2">
            {actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-2">
                <input type="checkbox" className="mt-1" aria-label={`Action ${i + 1}`} />
                <span>
                  <Glose>{a}</Glose>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Démarches à demander aux parties (F-1) — à proximité des courriers qui les portent. */}
      {demarches.length > 0 && (
        <div className="mt-6 rounded-lg border border-line bg-surface p-4">
          <SectionTitle>Démarches à demander aux parties</SectionTitle>
          <p className="mb-2 text-xs text-ink-3">
            Ces démarches sont portées par les modèles ci-dessous (notamment C2) ; suivez leur
            avancement ici — même état que l’écran d’urgence.
          </p>
          <ul className="space-y-2">
            {demarches.map((m) => (
              <MesureRow key={m.id} item={m} />
            ))}
          </ul>
        </div>
      )}

      {/* Bloc « Modèles de mails ou courriers recommandés ». */}
      <ListeCourriersLiens ids={recommandes} />

      {/* Modifier une réponse du parcours (H-4) — invalide l'aval. */}
      <details className="no-print mt-6 rounded-lg border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink-2">
          Modifier une réponse du parcours
        </summary>
        <p className="mt-2 text-xs text-ink-3">
          Une information nouvelle (attestation reçue, origine déplacée par la recherche de
          fuite…) ? Revenez à la question concernée ; les étapes suivantes seront recalculées.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {Object.entries(reponses(wizard)).map(([nid, label]) => {
            const q = getNode(nid);
            const question = q.type === 'question' ? q.question : nid;
            return (
              <li key={nid} className="flex items-start justify-between gap-3">
                <span>
                  <span className="text-ink-3">{question}</span>
                  <br />
                  <span className="font-medium text-ink">{label}</span>
                </span>
                <Button
                  variant="ghost"
                  aria-label={`Modifier la réponse : ${question}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Cette modification peut remettre en cause les étapes suivantes. Continuer ?',
                      )
                    ) {
                      dispatch({ type: 'MODIFIER_REPONSE', nodeId: nid });
                    }
                  }}
                >
                  Modifier
                </Button>
              </li>
            );
          })}
        </ul>
      </details>

      <References items={node.references} />
    </div>
  );
}