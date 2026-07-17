'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  chargerContexteDossierAction,
  chargerMesImmeublesAction,
  enregistrerSinistreAction,
  type ImmeubleOption,
} from '@/app/sinistre/actions';
import { useDossier, useActiveLocal } from '@/lib/domain/sinistre/state/store';
import type { WizardState } from '@/lib/domain/sinistre/types';
import { currentNode, isTransparent, cheminMixte, pathOf } from '@/lib/domain/sinistre/engine/wizard';
import { progression } from '@/lib/domain/sinistre/engine/progression';
import { aujourdhuiISO, dateEstFuture } from '@/lib/domain/sinistre/util/date';
import { nomLocalValide } from '@/lib/domain/sinistre/util/local';
import { LocauxBar } from './LocauxBar';
import { QuestionView } from './QuestionView';
import { EtapeView } from './EtapeView';
import { Resultat } from './Resultat';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Enregistrement serveur (incrément 3) : la vérité devient le serveur une fois le
// dossier enregistré ; le brouillon localStorage reste un filet hors-ligne. Le
// parcours n'est jamais bloqué si la persistance échoue (mode dégradé).
function DossierPanel() {
  const { state, dispatch } = useDossier();
  // Replié par défaut : « on prend trop de temps à lire ». Le parcours n'a pas besoin
  // de ce formulaire pour avancer (seuls le nom du local et une date non future
  // bloquent) - on l'ouvre quand on veut enregistrer, pas avant.
  const [ouvert, setOuvert] = useState(false);
  const [enregistrement, demarrerEnregistrement] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  // Selecteur d'immeuble : SES copros (cloisonnees cote serveur). Charge une seule
  // fois au montage du panel. Saisie libre par defaut -> permet de rattacher une copro
  // et donc de poser coproprieteId/agenceId (debloque l'enregistrement serveur).
  const [immeubles, setImmeubles] = useState<ImmeubleOption[]>([]);
  const [signataire, setSignataire] =
    useState<{ nom: string; email: string; initiales: string } | null>(null);
  const [saisieCopro, setSaisieCopro] = useState('');
  const [charge, setCharge] = useState(false);
  const [, chargerImmeubles] = useTransition();
  const immeublesCharges = useRef(false);

  useEffect(() => {
    if (immeublesCharges.current) return;
    immeublesCharges.current = true;
    chargerImmeubles(async () => {
      const res = await chargerMesImmeublesAction();
      setImmeubles(res.immeubles);
      setSignataire(res.gestionnaire);
      setCharge(true);
    });
  }, []);

  // Nom de la copro rattachee (indicateur "Rattachee : ..."). On retrouve l'option par
  // son code (= coproprieteId) ; repli sur le nom d'immeuble saisi si l'option n'est pas
  // dans la liste (ex. pre-remplie depuis ?dossier avant chargement).
  const coproRattachee = state.coproprieteId
    ? (immeubles.find((i) => i.code === state.coproprieteId)?.nom ?? state.immeuble.nom)
    : '';

  // Selection d'une copro depuis la datalist : on retrouve l'option par "nom (code)"
  // puis on dispatch (pose nom + adresse + coproprieteId + agenceId + signataire).
  const choisirCopro = (valeur: string) => {
    setSaisieCopro(valeur);
    const choix = immeubles.find((i) => `${i.nom} (${i.code})` === valeur);
    if (!choix) return;
    dispatch({
      type: 'SELECTIONNER_COPROPRIETE',
      coproprieteId: choix.code,
      ...(choix.agenceId ? { agenceId: choix.agenceId } : {}),
      nom: choix.nom,
      adresse: choix.adresse,
      assureurNom: '',
      assureurPolice: '',
      ...(signataire ? { gestionnaire: signataire } : {}),
    });
    setSaisieCopro('');
  };

  const enregistrer = () => {
    setRetour(null);
    demarrerEnregistrement(async () => {
      const res = await enregistrerSinistreAction(state);
      if (res.ok) {
        dispatch({
          type: 'PERSISTE_OK',
          id: res.id,
          referenceInterne: res.referenceInterne,
          ...(res.dossierId ? { dossierId: res.dossierId } : {}),
        });
        setRetour({
          ok: true,
          texte: res.dossierId
            ? `Enregistré (${res.referenceInterne}) - visible dans Mes dossiers`
            : `Enregistré (${res.referenceInterne}) - dossier non créé, sinistre conservé`,
        });
      } else {
        setRetour({ ok: false, texte: res.erreur });
      }
    });
  };

  return (
    <Card className="no-print mb-4 p-4">
      <button
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="font-semibold text-ink-2">
            Dossier {state.referenceInterne}
            {state.immeuble.nom ? ` - ${state.immeuble.nom}` : ''}
          </span>
          {/* Replié : on dit en une ligne ce qu'il reste à faire pour enregistrer. */}
          <span className="mt-0.5 block text-xs font-normal text-ink-4">
            {state.id
              ? 'Enregistré - ouvrir pour modifier'
              : state.coproprieteId
                ? 'Ouvrir pour compléter et enregistrer'
                : 'Copropriété à rattacher avant d’enregistrer'}
          </span>
        </span>
        <span aria-hidden className="text-ink-4">
          {ouvert ? '▲' : '▼'}
        </span>
      </button>

      {/* Le sinistre enregistré vit desormais comme un DOSSIER : on donne le lien. */}
      {state.dossierId && (
        <p className="mt-2 text-xs">
          <Link
            href={`/dossiers/${state.dossierId}`}
            className="font-medium text-green-700 underline hover:text-green-600"
          >
            Ouvrir le dossier dans « Mes dossiers »
          </Link>
        </p>
      )}

      {ouvert && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="text-ink-3">Copropriété concernée</span>
            <input
              list="liste-mes-immeubles"
              value={saisieCopro}
              placeholder={
                !charge
                  ? 'Chargement de vos copropriétés…'
                  : immeubles.length
                    ? 'Rechercher une de vos copropriétés (nom ou code)'
                    : 'Aucune copropriété dans votre périmètre'
              }
              onChange={(e) => choisirCopro(e.target.value)}
              className="mt-1 w-full rounded border border-line-2 px-2 py-1"
            />
            <datalist id="liste-mes-immeubles">
              {immeubles.map((i) => (
                <option key={i.code} value={`${i.nom} (${i.code})`} />
              ))}
            </datalist>
            {coproRattachee ? (
              <span className="mt-1 block text-xs text-ok-700">
                Rattachée : {coproRattachee} — enregistrement débloqué.
              </span>
            ) : (
              <span className="mt-1 block text-xs text-ink-4">
                Choisissez une copropriété pour rattacher ce dossier (nécessaire à
                l’enregistrement).
              </span>
            )}
          </label>
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

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button variant="primary" onClick={enregistrer} disabled={enregistrement}>
              {enregistrement
                ? 'Enregistrement…'
                : state.id
                  ? 'Enregistrer les modifications'
                  : 'Enregistrer'}
            </Button>
            {retour && (
              <span
                role="status"
                className={`text-sm ${retour.ok ? 'text-ok-700' : 'text-warn-700'}`}
              >
                {retour.texte}
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Progression du parcours - remplace le fil des 7 phases (« Urgence › Qualification
 * › Tranche › CIDECOP »), qui était le vocabulaire du MOTEUR, pas celui du
 * gestionnaire : l'écran expliquait l'algorithme au lieu de faire avancer.
 *
 * Le total vient du domaine (`progression`), qui parcourt le graphe et refuse de
 * répondre quand aucun chiffre honnête n'est calculable. On affiche donc, selon
 * ce qui est vrai : « Question 3 sur 6 », « Question 3 sur ~6 », ou « Question 3 »
 * tout court. Jamais de total en dur.
 */
function ProgressionParcours({ wizard }: { wizard: WizardState }) {
  const { numero, total, approximatif } = progression(wizard);
  if (numero === undefined) return null;

  const texte =
    total === undefined
      ? `Question ${numero}`
      : `Question ${numero} sur ${approximatif ? '~' : ''}${total}`;
  // Le « ~ » ne se lit pas : on double d'un libellé explicite pour les lecteurs d'écran.
  const texteLu =
    total === undefined
      ? `Question ${numero}. Le nombre total dépend de vos réponses.`
      : `Question ${numero} sur ${approximatif ? 'environ ' : ''}${total}`;

  return (
    <div className="no-print mb-4">
      <p className="text-xs font-medium text-ink-3">
        <span aria-hidden>{texte}</span>
        <span className="sr-only">{texteLu}</span>
      </p>
      {total !== undefined && (
        <div aria-hidden className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-green-700 transition-all"
            style={{ width: `${Math.round((numero / total) * 100)}%` }}
          />
        </div>
      )}
    </div>
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

  // Pré-remplissage immeuble/copro/signataire depuis le dossier rattaché (?dossier=<id>).
  // Tue la double-saisie : on ne re-tape plus le nom/adresse de l'immeuble.
  // NON DESTRUCTIF : on ne remplit QUE si l'immeuble est encore vide (jamais d'écrasement
  // d'une saisie en cours ni d'un brouillon repris). On attend que le provider ait fini son
  // init (referenceInterne posée) pour ne pas courir avec le chargement du brouillon, et on
  // ne déclenche qu'une fois.
  const [, demarrer] = useTransition();
  const prerempliFait = useRef(false);
  const immeubleVide = !state.immeuble.nom && !state.immeuble.adresse;
  useEffect(() => {
    if (!dossierId || prerempliFait.current) return;
    if (!state.referenceInterne || !immeubleVide) return;
    prerempliFait.current = true;
    demarrer(async () => {
      const ctx = await chargerContexteDossierAction(dossierId);
      if (!ctx) return;
      dispatch({
        type: 'SELECTIONNER_COPROPRIETE',
        coproprieteId: ctx.coproCode,
        ...(ctx.agenceId ? { agenceId: ctx.agenceId } : {}),
        nom: ctx.coproNom,
        adresse: ctx.immeubleAdresse,
        assureurNom: '',
        assureurPolice: '',
        gestionnaire: ctx.gestionnaire,
        // Déjà rattaché : l'enregistrement ne doit pas créer un second dossier.
        dossierId: ctx.dossierId,
      });
    });
  }, [dossierId, state.referenceInterne, immeubleVide, dispatch]);

  const blocages = blocagesProgression(state.date, local.libelle);
  const bloque = blocages.length > 0;

  // L'erreur se montre quand on TENTE d'avancer, jamais à l'atterrissage : on
  // n'accueille pas le collaborateur en lui reprochant un local qu'il n'a pas
  // encore nommé. La validation, elle, ne bouge pas : `bloque` interdit toujours
  // de franchir l'étape. Une fois le blocage corrigé, l'alerte disparaît d'elle-même
  // (elle est conditionnée à `bloque`).
  const [tentative, setTentative] = useState(false);
  const refNomLocal = useRef<HTMLInputElement>(null);
  const afficherBlocages = tentative && bloque && node.type !== 'resultat';

  /**
   * Garde de progression. Retourne vrai si le geste peut passer ; sinon révèle
   * l'alerte et renvoie le focus sur le champ fautif - une erreur qu'on ne peut
   * pas réparer d'un geste n'est qu'une punition (et l'AA exige que l'alerte soit
   * annoncée au moment où elle survient).
   */
  const autoriseProgression = (): boolean => {
    if (!bloque) return true;
    setTentative(true);
    if (!nomLocalValide(local.libelle)) refNomLocal.current?.focus();
    return false;
  };

  // Filet de sécurité (G-3) : si l'on atterrit sur une étape transparente
  // (ex. brouillon réhydraté), la franchir sans l'afficher.
  const transparent = isTransparent(node);
  useEffect(() => {
    if (transparent) dispatch({ type: 'ADVANCE' });
  }, [transparent, dispatch]);
  if (transparent) return null;

  // AU-DESSUS DE LA QUESTION, le strict nécessaire : où j'en suis, sur quel local
  // je réponds (seulement s'il y en a plusieurs), et ce qui m'empêche d'avancer.
  // Tout le reste (contexte, bandeaux, formulaire de dossier) passe SOUS la
  // question : rien n'est supprimé, tout descend d'un cran.
  const multiLocaux = state.locaux.length > 1;

  return (
    <div>
      {node.type !== 'resultat' && <ProgressionParcours wizard={local.wizard} />}

      {multiLocaux && <LocauxBar refNomActif={refNomLocal} nomEnErreur={afficherBlocages} />}

      {afficherBlocages && (
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

      <Card className="p-5">
        {node.type === 'question' && (
          <QuestionView
            node={node}
            nodeId={local.wizard.current}
            onAnswer={(i) => {
              if (autoriseProgression()) dispatch({ type: 'ANSWER', optionIndex: i });
            }}
          />
        )}
        {node.type === 'etape' && (
          <EtapeView
            node={node}
            onContinue={() => {
              if (autoriseProgression()) dispatch({ type: 'ADVANCE' });
            }}
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

      <div className="mt-8 border-t border-line pt-6">
      {/* Un seul local : la ligne de nommage vit ici, sous la question (la barre
          d'onglets ne sert à rien tant qu'il n'y a pas de 2e local à choisir). */}
      {!multiLocaux && <LocauxBar refNomActif={refNomLocal} nomEnErreur={afficherBlocages} />}

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

      {dossierId && (
        <div className="no-print mb-4 flex items-center justify-between gap-3 rounded-md border-l-4 border-info-500 bg-info-50 px-3 py-2 text-sm text-info-700">
          <span>Analyse rattachée à un dossier · la synthèse pourra y être reportée depuis l’écran de résultat.</span>
          <Link href={`/dossiers/${dossierId}`} className="shrink-0 font-medium underline">
            Revenir au dossier
          </Link>
        </div>
      )}

      <DossierPanel />
      </div>
    </div>
  );
}
