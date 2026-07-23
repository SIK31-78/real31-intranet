import Link from "next/link";
import {
  Flag,
  History,
  CircleCheck,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Route,
  Users,
  Calculator,
} from "lucide-react";
import type {
  AgPassee,
  Copropriete,
  EtatConformite,
  FicheCopro,
  ItemConformite,
  MembreConseilSyndical,
  MembreEquipe,
  ProchaineAg,
  RoleEquipe,
} from "@/lib/domain/copropriete";
import type { CycleAg } from "@/lib/domain/cycle-ag";
import type { EtatCompta } from "@/lib/domain/compta";
import type { ModeReunion, StatutConfirmation } from "@/lib/domain/confirmation-evenement";
import { ComptaPanel } from "@/components/compta/compta-panel";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FriseEtapes } from "@/components/parcours/frise-etapes";
import { formatDateLongue } from "@/lib/format-date";
import { EditeurDate } from "./editeur-date";
import { ActionCycleFiche } from "./action-cycle-fiche";
import { ConfirmationEvenement } from "./confirmation-evenement";
import { MailReunionBouton } from "./mail-reunion-bouton";
import { ListeDiffusionCS } from "./liste-diffusion-cs";
import type { EtatListeSecoursCS } from "@/lib/services/coproprietes/etat-liste-secours-cs";

const ROLE_LABEL: Record<RoleEquipe, string> = {
  gestionnaire: "Gestionnaire",
  assistant: "Assistant·e",
  comptable: "Comptable",
  directeur: "Directeur",
  negociateur: "Négociateur",
};

const STATUT_AG_LABEL: Record<ProchaineAg["statut"], string> = {
  planifiee: "Planifiée",
  en_preparation: "En préparation",
  convoquee: "Convoquée",
};

export function FicheVueEnsemble({
  fiche,
  mailActif = false,
  estComptable = false,
  listeSecoursCS,
}: {
  fiche: FicheCopro;
  mailActif?: boolean;
  /** Visiteur du pole comptable : le bloc compta passe en role "comptable" (dialogue prevu
   *  pour eux) ; sinon "gestionnaire" (le gestionnaire de la copro repond a la comptable). */
  estComptable?: boolean;
  /** Etat de la liste de diffusion CS (secours) : source active + adresses editables. */
  listeSecoursCS?: EtatListeSecoursCS;
}) {
  const indispo = Boolean(fiche.estaleIndisponible);
  // Une action = UN lieu (S2.A.3). Quand l'action du moment du stepper renvoie DEJA vers
  // la supervision (convoc / tenue / conclure), on masque le lien "Ouvrir la supervision
  // AG" de la colonne Prochaine AG pour ne pas doubler l'entree. Sinon (ODJ, dates...),
  // ce lien reste la seule porte permanente vers la supervision.
  const stepperVersSupervision =
    fiche.cycle?.actionDuMoment?.href.startsWith("/supervision-ag/") ?? false;
  return (
    <div className="flex flex-col gap-5">
      {indispo && <BanniereEstaleIndispo />}
      {fiche.cycle && <BlocParcours cycle={fiche.cycle} coproCode={fiche.copro.code} />}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        <div className="flex flex-col gap-5">
          <BlocAg
            coproCode={fiche.copro.code}
            derniere={fiche.derniereAg}
            derniereAgDate={fiche.copro.derniereAgDate}
            prochaine={fiche.copro.prochaineAg}
            conformite={fiche.conformite}
            derniereCs={fiche.copro.derniereCsDate}
            prochaineCs={fiche.copro.prochaineCsDate}
            prochaineCsHeure={fiche.copro.prochaineCsHeure}
            confirmationAg={fiche.confirmationAg}
            confirmationCs={fiche.confirmationCs}
            salleAgEmail={fiche.salleAgEmail}
            vehiculeAgEmail={fiche.vehiculeAgEmail}
            salleCsEmail={fiche.salleCsEmail}
            vehiculeCsEmail={fiche.vehiculeCsEmail}
            modeAgReunion={fiche.modeAgReunion}
            modeCsReunion={fiche.modeCsReunion}
            collaborateursAg={fiche.collaborateursAg}
            collaborateursCs={fiche.collaborateursCs}
            agenceCode={fiche.agenceCode}
            mailActif={mailActif}
            listeSecoursCS={listeSecoursCS}
            masquerLienSupervision={stepperVersSupervision}
          />
          {/* Bloc Jalons retire : les echeances reglementaires sont desormais en
              colonne dans la Supervision AG (fusion B4, 2026-06-24). La machinerie
              jalons (intranet_jalons + alarme dashboard) reste inchangee. */}
          {fiche.compta && fiche.copro.prochaineAg && (
            <BlocCompta
              coproCode={fiche.copro.code}
              agDate={fiche.copro.prochaineAg.date}
              compta={fiche.compta}
              estComptable={estComptable}
            />
          )}
          <HistoriqueAg historique={fiche.historique} />
        </div>

        <div className="flex flex-col gap-3">
          <SideIdentite copro={fiche.copro} />
          <SideEquipe equipe={fiche.copro.equipe} />
          <SideConseil
            membres={fiche.estale.conseilSyndical}
            mandatJusqua={fiche.estale.mandatJusqua}
            indisponible={indispo}
          />
          <SideConformite items={fiche.conformite} indisponible={indispo} />
        </div>
      </div>
    </div>
  );
}

// --- Cycle AG (ou en est cette copro + action DU MOMENT) -------------------
// Stepper migre sur LA source unique (domain/cycle-ag, refonte S2.A) : il n'affiche
// QUE l'action du moment, pilotee par l'etat. Plus de bouton a contre-temps.

function BlocParcours({ cycle, coproCode }: { cycle: CycleAg; coproCode: string }) {
  const action = cycle.actionDuMoment;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Route strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Où en est cette AG
        </CardTitle>
        {cycle.echeance && (
          <span
            className="inline-flex items-center"
            title={`Échéance de l'étape en cours${cycle.enRetard ? " (en retard)" : ""}`}
          >
            <Badge
              ton={cycle.enRetard ? "err" : cycle.echeance.startsWith("J-") ? "outline" : "warn"}
              className="font-mono"
              dot={Boolean(cycle.enRetard)}
            >
              {cycle.echeance}
            </Badge>
          </span>
        )}
      </CardHeader>
      <div className="px-4 py-3.5">
        <FriseEtapes etapes={cycle.etapes} />
        <div className="mt-3 flex items-center justify-between gap-3">
          {action ? (
            <>
              <p className="text-[12px] text-ink-3">
                Action du moment : <span className="text-ink-2">{action.action}</span>
              </p>
              <ActionCycleFiche action={action} coproCode={coproCode} />
            </>
          ) : (
            <p className="text-[12px] text-ink-3">
              Cycle terminé pour cet exercice — rien à faire avant la prochaine clôture.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// --- Preparation comptable (flags + fil de notes, cote gestionnaire) -------

function BlocCompta({
  coproCode,
  agDate,
  compta,
  estComptable,
}: {
  coproCode: string;
  agDate: string;
  compta: EtatCompta;
  estComptable: boolean;
}) {
  const ouvertes = compta.notes.filter((n) => !n.resolu).length;
  // Notes ECRITES PAR LA COMPTABLE non traitees : le signal qui doit sauter aux yeux du
  // gestionnaire (une note l'attend). Badge warn saillant dans l'en-tete.
  const notesComptable = compta.notes.filter((n) => n.auteur === "comptable" && !n.resolu).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Calculator strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Préparation comptable
        </CardTitle>
        <div className="flex items-center gap-2">
          {notesComptable > 0 && (
            <Badge ton="warn" dot>
              {notesComptable} note{notesComptable > 1 ? "s" : ""} comptable{notesComptable > 1 ? "s" : ""} à traiter
            </Badge>
          )}
          {compta.comptesVerifies ? (
            <Badge ton="ok" dot>
              Comptes vérifiés
            </Badge>
          ) : (
            <Badge ton="outline">comptes à vérifier</Badge>
          )}
        </div>
      </CardHeader>
      <div className="px-4 py-3">
        {ouvertes > 0 && (
          <p className="text-[12px] text-warn-700 mb-2">
            {ouvertes} note{ouvertes > 1 ? "s" : ""} {estComptable ? "ouverte" : "de la comptable"}
            {ouvertes > 1 ? "s" : ""} à traiter - {estComptable ? "échange" : "réponds"} ici pour ne
            rien oublier.
          </p>
        )}
        <ComptaPanel
          coproCode={coproCode}
          agDateISO={agDate}
          etat={compta}
          role={estComptable ? "comptable" : "gestionnaire"}
        />
      </div>
    </Card>
  );
}

// --- Banniere Estale indisponible (panne passagere) -----------------------

function BanniereEstaleIndispo() {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-warn-500/30 bg-warn-50 px-3.5 py-2.5">
      <AlertTriangle strokeWidth={1.5} className="w-4 h-4 text-warn-700 shrink-0 mt-px" />
      <p className="text-[12.5px] text-warn-700">
        Données Estale temporairement indisponibles (panne passagère du service). Le
        référentiel reste affiché ; rechargez la page dans un instant pour retrouver le
        conseil syndical, l&apos;historique et la conformité.
      </p>
    </div>
  );
}

// --- Bloc AG (derniere tenue + prochaine) ---------------------------------

function BlocAg({
  coproCode,
  derniere,
  derniereAgDate,
  prochaine,
  conformite,
  derniereCs,
  prochaineCs,
  prochaineCsHeure,
  confirmationAg,
  confirmationCs,
  salleAgEmail,
  vehiculeAgEmail,
  salleCsEmail,
  vehiculeCsEmail,
  modeAgReunion,
  modeCsReunion,
  collaborateursAg,
  collaborateursCs,
  agenceCode,
  mailActif,
  listeSecoursCS,
  masquerLienSupervision,
}: {
  coproCode: string;
  derniere?: AgPassee;
  derniereAgDate?: string;
  prochaine?: ProchaineAg;
  conformite: ItemConformite[];
  derniereCs?: string;
  prochaineCs?: string;
  prochaineCsHeure?: string;
  confirmationAg?: StatutConfirmation;
  confirmationCs?: StatutConfirmation;
  salleAgEmail?: string;
  vehiculeAgEmail?: string;
  salleCsEmail?: string;
  vehiculeCsEmail?: string;
  modeAgReunion?: ModeReunion;
  modeCsReunion?: ModeReunion;
  collaborateursAg?: { email: string; nom: string }[];
  collaborateursCs?: { email: string; nom: string }[];
  /** Code d'agence de la copro : filtre les salles/collegues proposes dans l'editeur. */
  agenceCode?: string;
  mailActif: boolean;
  listeSecoursCS?: EtatListeSecoursCS;
  /** Le stepper "Ou en est cette AG" renvoie DEJA vers la supervision (action du moment)
   *  -> on masque ici le lien "Ouvrir la supervision AG" pour ne pas doubler l'entree. */
  masquerLienSupervision?: boolean;
}) {
  const agAJour = conformite.find((c) => c.libelle.toLowerCase().includes("ag annuelle"));
  // Le mail au CS propose les dates a venir (CS + AG en un seul mail). Visible des
  // qu'au moins une date a venir est posee (confirmationAg / confirmationCs ne sont
  // definis que pour une date future).
  const auMoinsUneDate = Boolean(confirmationAg) || Boolean(confirmationCs);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Flag strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Assemblées générales
        </CardTitle>
        {/* En-tete SANS bouton de cycle (refonte S2.A.1) : les CTA ODJ / Supervision qui
            s'affichaient quand il n'y avait PAS de date (le pire moment) sont supprimes.
            L'action legitime est pilotee par l'etat dans le stepper "Ou en est cette AG". */}
        <div className="flex items-center gap-2">
          {agAJour?.etat === "ok" && <Badge ton="ok" dot>À jour</Badge>}
        </div>
      </CardHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line">
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-[0.5px] text-ink-3 mb-1">
            Dernière AG tenue
          </p>
          <EditeurDate coproCode={coproCode} type="ag" quand="derniere" dateISO={derniereAgDate} />
          {derniere && (
            <>
              <p className="mt-1.5 text-[12px] text-ink-3">
                {/* Date intranet absente mais eStale connait une AG (ex. PV signe hors cycle
                    intranet) : on montre la date eStale pour ne pas laisser "PV disponible"
                    orphelin sous "Non renseignée". */}
                {!derniereAgDate && derniere.date && (
                  <span className="text-ink-2">Connue via eStale : {formatDateLongue(derniere.date)} · </span>
                )}
                {derniere.type === "AGE" ? "AGE" : "AG ordinaire"}
                {derniere.presents != null
                  ? ` · ${derniere.presents} présents/représentés sur ${derniere.total}`
                  : ""}
              </p>
              {derniere.pvDispo && (
                <div className="mt-2">
                  <Badge ton="outline">PV disponible</Badge>
                </div>
              )}
            </>
          )}
        </div>

        {/* Ancre #dates-ag : cible du scroll + focus clavier du bouton "Fixer" du stepper
            (S2.A.4). Fixer les dates se joue ICI (les crayons), pas via un lien circulaire. */}
        <div id="dates-ag" className="p-4">
          <p className="text-[11px] uppercase tracking-[0.5px] text-ink-3 mb-1">Prochaine AG</p>
          <div className="flex items-center gap-2 flex-wrap">
            <EditeurDate
              coproCode={coproCode}
              type="ag"
              dateISO={prochaine?.date}
              heure={prochaine?.heure}
              salleEmail={salleAgEmail}
              vehiculeEmail={vehiculeAgEmail}
              modeReunion={modeAgReunion}
              collaborateurs={collaborateursAg}
              agenceCode={agenceCode}
            />
            {/* Confirmation par le CS : badge + bouton, seulement si la date est a venir
                (le service ne pose un statut que dans ce cas). */}
            {prochaine && confirmationAg && (
              <ConfirmationEvenement coproCode={coproCode} type="AG" statut={confirmationAg} />
            )}
          </div>
          {prochaine && (
            <>
              <p className="mt-1.5 text-[12px] text-ink-3">{STATUT_AG_LABEL[prochaine.statut]}</p>
              {prochaine.alerte && (
                <p className="mt-1 text-[12px] text-warn-700 flex items-center gap-1">
                  <AlertCircle strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" />
                  {prochaine.alerte}
                </p>
              )}
              {/* Lien canonique unique vers la supervision (libelle "Ouvrir la supervision
                  AG"). Masque quand le stepper renvoie DEJA la (pas de doublon, S2.A.3). */}
              {prochaine.supervisionId && !masquerLienSupervision && (
                <Link
                  href={`/supervision-ag/${prochaine.supervisionId}`}
                  className="mt-2 inline-flex items-center gap-1 text-[12px] text-info-700 hover:underline"
                >
                  Ouvrir la supervision AG
                  <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {/* Conseil syndical : prepare l'AG -> rattache au meme bloc (compact). */}
      <div className="border-t border-line px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.5px] text-ink-3 mb-2 flex items-center gap-1.5">
          <Users strokeWidth={1.5} className="w-3.5 h-3.5" />
          Conseil syndical
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] text-ink-3 shrink-0">Dernier CS :</span>
            <EditeurDate coproCode={coproCode} type="cs" quand="derniere" dateISO={derniereCs} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] text-ink-3 shrink-0">Prochain CS :</span>
            <span className="inline-flex items-center gap-2 flex-wrap">
              <EditeurDate
                coproCode={coproCode}
                type="cs"
                dateISO={prochaineCs}
                heure={prochaineCsHeure}
                salleEmail={salleCsEmail}
                vehiculeEmail={vehiculeCsEmail}
                modeReunion={modeCsReunion}
                collaborateurs={collaborateursCs}
                agenceCode={agenceCode}
              />
              {prochaineCs && confirmationCs && (
                <ConfirmationEvenement coproCode={coproCode} type="CS" statut={confirmationCs} />
              )}
            </span>
          </div>
        </div>

        {/* UN seul mail au CS propose les dates a venir (CS preparatoire + AG ensemble,
            verbatim cabinet). Pre-rempli -> relu -> envoye sur clic. Grise tant que le
            mail n'est pas active pour ce compte. */}
        {auMoinsUneDate && (
          <div className="mt-3 flex justify-end">
            <MailReunionBouton coproCode={coproCode} actif={mailActif} />
          </div>
        )}
      </div>

      {/* Liste de diffusion CS (secours) editable : rend modifiable la couche Crypto/intranet
          des destinataires. eStale reste prioritaire -> l'indicateur de source (dans le
          composant) dit si l'edition affectera le mail. */}
      {listeSecoursCS && (
        <ListeDiffusionCS
          coproCode={coproCode}
          estaleFournitEmails={listeSecoursCS.estaleFournitEmails}
          emailsSecours={listeSecoursCS.emailsSecours}
        />
      )}
    </Card>
  );
}

// --- Historique des AG ----------------------------------------------------

function HistoriqueAg({ historique }: { historique: AgPassee[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <History strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Historique des AG
        </CardTitle>
      </CardHeader>

      {historique.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-ink-3">
          Aucune AG enregistrée.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {historique.map((ag) => (
            <li key={ag.date} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              <span className="font-medium text-ink shrink-0">{formatDateLongue(ag.date)}</span>
              <span className="text-ink-3 flex-1 truncate">
                {ag.type === "AGE" ? "AGE" : "AG ordinaire"}
                {ag.libelle ? ` · ${ag.libelle}` : ""}
                {ag.presents != null ? ` · ${ag.presents}/${ag.total}` : ""}
              </span>
              {ag.pvDispo && <Badge ton="outline" className="shrink-0">PV</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// --- Sidebar --------------------------------------------------------------

function SideBox({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-md p-3.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 mb-2.5">
        {titre}
      </h4>
      {children}
    </div>
  );
}

function SideRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-[12.5px]">
      <span className="text-ink-3">{label}</span>
      <span className="text-ink font-medium text-right">{value}</span>
    </div>
  );
}

function SideIdentite({ copro }: { copro: Copropriete }) {
  return (
    <SideBox titre="Identité">
      <SideRow label="Code" value={copro.code} />
      <SideRow label="Statut" value={copro.statut === "active" ? "Active" : "Inactive"} />
      <SideRow label="Lots principaux" value={String(copro.lotsPrincipaux)} />
      {copro.lotsAutres > 0 && <SideRow label="Autres lots" value={String(copro.lotsAutres)} />}
      <SideRow label="Exercice" value={`${copro.exercice.debut} -> ${copro.exercice.fin}`} />
      <SideRow label="Prise en gestion" value={copro.priseEnGestion} />
    </SideBox>
  );
}

function SideEquipe({ equipe }: { equipe: MembreEquipe[] }) {
  return (
    <SideBox titre="Équipe">
      <div className="flex flex-col gap-2">
        {equipe.map((m, i) => (
          <div key={`${m.initiales}-${i}`} className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-surface-2 text-ink-2 text-[11px] font-medium flex items-center justify-center shrink-0">
              {m.initiales}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink truncate">{m.nomComplet}</p>
              <p className="text-[11px] text-ink-3">{ROLE_LABEL[m.role]}</p>
            </div>
          </div>
        ))}
      </div>
    </SideBox>
  );
}

function SideConseil({
  membres,
  mandatJusqua,
  indisponible,
}: {
  membres: MembreConseilSyndical[];
  mandatJusqua?: string;
  indisponible?: boolean;
}) {
  return (
    <SideBox titre="Conseil Syndical">
      {membres.length === 0 ? (
        <p className="text-[12px] text-ink-3">
          {indisponible ? "Estale temporairement indisponible." : "Donnée Estale - non disponible."}
        </p>
      ) : (
        <div className="text-[12.5px]">
          {membres.map((m) => (
            <div key={m.nomComplet} className="py-0.5">
              <span className="font-medium text-ink">{m.nomComplet}</span>
              {m.role === "president" && <span className="text-ink-3"> (président·e)</span>}
            </div>
          ))}
          {mandatJusqua && (
            <p className="mt-1.5 text-[11px] text-ink-3">Mandats jusqu&apos;à l&apos;{mandatJusqua}</p>
          )}
        </div>
      )}
    </SideBox>
  );
}

const CONFORMITE_STYLE: Record<EtatConformite, { className: string }> = {
  ok: { className: "text-ok-700" },
  attention: { className: "text-warn-700" },
  ko: { className: "text-err-700" },
};

function SideConformite({
  items,
  indisponible,
}: {
  items: ItemConformite[];
  indisponible?: boolean;
}) {
  return (
    <SideBox titre="Conformité">
      {items.length === 0 ? (
        <p className="text-[12px] text-ink-3">
          {indisponible ? "Estale temporairement indisponible." : "Donnée Estale - non disponible."}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((item) => {
            const Icone = item.etat === "ok" ? CircleCheck : AlertCircle;
            return (
              <div key={item.libelle} className="flex items-center gap-2 text-[12.5px]">
                <Icone
                  strokeWidth={1.5}
                  className={`w-4 h-4 shrink-0 ${CONFORMITE_STYLE[item.etat].className}`}
                />
                <span className={item.etat === "ok" ? "text-ink" : CONFORMITE_STYLE[item.etat].className}>
                  {item.libelle}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </SideBox>
  );
}
