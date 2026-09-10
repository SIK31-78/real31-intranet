import { ArrowRight, CircleCheck, AlertCircle, FileText, Flag, History, Route, Users } from "lucide-react";
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
import type { ModeReunion, StatutConfirmation } from "@/lib/domain/confirmation-evenement";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Callout } from "@/components/ui/callout";
import { ButtonLink } from "@/components/ui/button";
import { DataList, DataRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/ui/table";
import { FriseEtapes } from "@/components/parcours/frise-etapes";
import { actionPrincipaleEcran } from "@/components/parcours/action-principale";
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
  listeSecoursCS,
}: {
  fiche: FicheCopro;
  mailActif?: boolean;
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
  // Idem pour l'ODJ : le stepper y renvoie deja pendant la phase ODJ (action du moment
  // ou action secondaire "Preparer l'ODJ"), inutile de doubler l'entree.
  const stepperVersOdj =
    (fiche.cycle?.actionDuMoment?.href.startsWith("/odj/") ?? false) ||
    (fiche.cycle?.actionDuMoment?.secondaire?.href.startsWith("/odj/") ?? false);
  return (
    <div className="flex flex-col gap-5">
      {indispo && (
        <Callout ton="warn" titre="Données ESTALE temporairement indisponibles">
          le référentiel reste affiché ; rechargez la page dans un instant pour retrouver le conseil
          syndical, l&apos;historique et la conformité.
        </Callout>
      )}
      {fiche.cycle && (
        <BlocParcours
          cycle={fiche.cycle}
          coproCode={fiche.copro.code}
          derniereAgDate={fiche.copro.derniereAgDate}
        />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
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
            masquerLienOdj={stepperVersOdj}
          />
          {/* Bloc Jalons retire : les echeances reglementaires sont desormais en
              colonne dans la Supervision AG (fusion B4, 2026-06-24). La machinerie
              jalons (intranet_jalons + alarme dashboard) reste inchangee. */}
          {/* Bloc "Preparation comptable" RETIRE de la fiche (Sekou 2026-07-28) : la
              checklist + les notes vivent dans l'espace comptable dedie
              (/compta/[code__agDate]), la fiche n'a pas a le dupliquer. */}
          <HistoriqueAg historique={fiche.historique} />
        </div>

        {/* Colonne laterale : UNE carte, quatre blocs separes par une hairline. */}
        <Card>
          <div className="divide-y divide-line">
            <SideIdentite copro={fiche.copro} />
            <SideEquipe equipe={fiche.copro.equipe} />
            <SideConseil membres={fiche.estale.conseilSyndical} indisponible={indispo} />
            <SideConformite items={fiche.conformite} indisponible={indispo} />
          </div>
        </Card>
      </div>
    </div>
  );
}

// --- Cycle AG (ou en est cette copro + action DU MOMENT) -------------------
// LE bloc dominant de la fiche : la frise et le SEUL bouton primaire de la page. Migre
// sur LA source unique (domain/cycle-ag, refonte S2.A) via actionPrincipaleEcran.

function BlocParcours({
  cycle,
  coproCode,
  derniereAgDate,
}: {
  cycle: CycleAg;
  coproCode: string;
  /** Date de la derniere AG tenue : porte vers sa supervision archivee quand le cycle est clos. */
  derniereAgDate?: string;
}) {
  const action = actionPrincipaleEcran(cycle, "fiche", { coproCode });
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Route strokeWidth={1.5} />
          Où en est cette AG
        </CardTitle>
        {cycle.echeance && (
          <Badge
            ton={cycle.enRetard ? "err" : cycle.echeance.startsWith("J-") ? "outline" : "warn"}
            dot={Boolean(cycle.enRetard)}
            title={`Échéance de l'étape en cours${cycle.enRetard ? " (en retard)" : ""}`}
          >
            {cycle.echeance}
          </Badge>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <FriseEtapes etapes={cycle.etapes} />
        <div className="flex items-center justify-between gap-3">
          {action ? (
            <>
              <p className="text-body text-ink-2">
                Action du moment : <span className="text-ink font-medium">{cycle.actionDuMoment?.action}</span>
              </p>
              <ActionCycleFiche action={action} coproCode={coproCode} />
            </>
          ) : (
            <>
              <p className="text-body text-ink-2">Cycle terminé pour cet exercice : rien à faire avant la prochaine clôture.</p>
              {/* Le cycle clos ne doit pas etre une impasse : la supervision de l'AG
                  conclue reste consultable (checklist, commentaires, visa). */}
              {derniereAgDate && (
                <ButtonLink href={`/supervision-ag/${coproCode}__${derniereAgDate.slice(0, 10)}`} variant="ghost" size="sm">
                  Revoir la supervision de cette AG
                  <ArrowRight strokeWidth={1.5} />
                </ButtonLink>
              )}
            </>
          )}
        </div>
      </CardBody>
    </Card>
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
  masquerLienOdj,
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
  /** Idem pour l'ordre du jour pendant la phase ODJ. */
  masquerLienOdj?: boolean;
}) {
  const agAJour = conformite.find((c) => c.libelle.toLowerCase().includes("ag annuelle"));
  // Le mail au CS propose les dates a venir (CS + AG en un seul mail). Visible des
  // qu'au moins une date a venir est posee (confirmationAg / confirmationCs ne sont
  // definis que pour une date future).
  const auMoinsUneDate = Boolean(confirmationAg) || Boolean(confirmationCs);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Flag strokeWidth={1.5} />
          Assemblées générales
        </CardTitle>
        {/* En-tete SANS bouton de cycle (refonte S2.A.1) : les CTA ODJ / Supervision qui
            s'affichaient quand il n'y avait PAS de date (le pire moment) sont supprimes.
            L'action legitime est pilotee par l'etat dans le stepper "Ou en est cette AG". */}
        {agAJour?.etat === "ok" && <Badge ton="ok" dot>À jour</Badge>}
      </CardHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line">
        <CardBody padding="sm" className="flex flex-col gap-1.5">
          <Eyebrow>Dernière AG tenue</Eyebrow>
          <EditeurDate coproCode={coproCode} type="ag" quand="derniere" dateISO={derniereAgDate} />
          {derniere && (
            <p className="text-body text-ink-2 flex items-center gap-2 flex-wrap">
              {/* Date intranet absente mais eStale connait une AG (ex. PV signe hors cycle
                  intranet) : on montre la date eStale pour ne pas laisser "PV disponible"
                  orphelin sous "Non renseignee". */}
              {!derniereAgDate && derniere.date && (
                <span>Connue via ESTALE : {formatDateLongue(derniere.date)} ·</span>
              )}
              <span>
                {derniere.type === "AGE" ? "AGE" : "AG ordinaire"}
                {derniere.presents != null ? ` · ${derniere.presents} présents/représentés sur ${derniere.total}` : ""}
              </span>
              {derniere.pvDispo && <Badge ton="outline">PV disponible</Badge>}
            </p>
          )}
        </CardBody>

        {/* Ancre #dates-ag : cible du scroll + focus clavier du bouton "Fixer" du stepper
            (S2.A.4). Fixer les dates se joue ICI (les crayons), pas via un lien circulaire. */}
        <CardBody padding="sm" id="dates-ag" className="flex flex-col gap-1.5">
          <Eyebrow>Prochaine AG</Eyebrow>
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
            <div className="flex items-center gap-2 flex-wrap text-body text-ink-2">
              <Badge ton="neutral">{STATUT_AG_LABEL[prochaine.statut]}</Badge>
              {prochaine.alerte && (
                <span className="inline-flex items-center gap-1 text-warn-700">
                  <AlertCircle strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  {prochaine.alerte}
                </span>
              )}
              {/* Lien canonique unique vers la supervision (libelle "Ouvrir la supervision
                  AG"). Masque quand le stepper renvoie DEJA la (pas de doublon, S2.A.3). */}
              {prochaine.supervisionId && !masquerLienSupervision && (
                <ButtonLink href={`/supervision-ag/${prochaine.supervisionId}`} variant="ghost" size="sm">
                  Ouvrir la supervision AG
                  <ArrowRight strokeWidth={1.5} />
                </ButtonLink>
              )}
            </div>
          )}
        </CardBody>
      </div>

      {/* Conseil syndical : prepare l'AG -> rattache au meme bloc (compact). */}
      <CardBody padding="sm" className="border-t border-line flex flex-col gap-2">
        <Eyebrow className="flex items-center gap-1.5">
          <Users strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden />
          Conseil syndical
        </Eyebrow>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body">
          <div className="flex items-baseline gap-2">
            <span className="text-ink-2 shrink-0">Dernier CS :</span>
            <EditeurDate coproCode={coproCode} type="cs" quand="derniere" dateISO={derniereCs} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-ink-2 shrink-0">Prochain CS :</span>
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
                <ConfirmationEvenement
                  coproCode={coproCode}
                  type="CS"
                  statut={confirmationCs}
                  {...(prochaineCsHeure ? { heureDebut: prochaineCsHeure } : {})}
                />
              )}
            </span>
          </div>
        </div>

        {/* PORTE PERMANENTE vers l'ordre du jour (Sekou 2026-09-10 : "je ne peux pas
            revenir sur un ordre du jour une fois celui-ci termine"). Sa place est ICI,
            dans le bloc du conseil syndical : l'ODJ est le document du CS preparatoire,
            il porte d'ailleurs la mention "Document issu du conseil syndical". Avant, il
            n'etait atteignable que par l'action du moment, qui disparait des que l'etape
            est franchie. Masque quand la frise y renvoie deja. */}
        {!masquerLienOdj && (
          <div>
            <ButtonLink href={`/odj/${prochaine?.supervisionId ?? coproCode}`} variant="ghost" size="sm">
              <FileText strokeWidth={1.5} />
              Voir l&apos;ordre du jour
            </ButtonLink>
          </div>
        )}

        {/* UN seul mail au CS propose les dates a venir (CS preparatoire + AG ensemble,
            verbatim cabinet). Pre-rempli -> relu -> envoye sur clic. Grise tant que le
            mail n'est pas active pour ce compte. */}
        {auMoinsUneDate && (
          <div className="flex justify-end">
            <MailReunionBouton coproCode={coproCode} actif={mailActif} />
          </div>
        )}
      </CardBody>

      {/* Liste de diffusion CS (secours) editable : rend modifiable la couche Crypto/intranet
          des destinataires. eStale reste prioritaire -> l'indicateur de source (dans le
          composant) dit si l'edition affectera le mail. */}
      {listeSecoursCS && (
        <ListeDiffusionCS
          coproCode={coproCode}
          sourceActive={listeSecoursCS.sourceActive}
          estaleFournitEmails={listeSecoursCS.estaleFournitEmails}
          destinatairesActifs={listeSecoursCS.destinatairesActifs}
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
        <CardTitle>
          <History strokeWidth={1.5} />
          Historique des AG
        </CardTitle>
        <span className="text-body text-ink-2 tabular-nums">{historique.length}</span>
      </CardHeader>
      {historique.length === 0 ? (
        <CardBody padding="sm">
          <EmptyState compact icone={History}>Aucune AG</EmptyState>
        </CardBody>
      ) : (
        <Table encadre={false}>
          <Thead>
            <tr>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th numeric>Présents</Th>
              <Th numeric>PV</Th>
            </tr>
          </Thead>
          <Tbody>
            {historique.map((ag) => (
              <Tr key={ag.date}>
                <Td principal>{formatDateLongue(ag.date)}</Td>
                <Td secondaire>
                  {ag.type === "AGE" ? "AGE" : "AG ordinaire"}
                  {ag.libelle ? ` · ${ag.libelle}` : ""}
                </Td>
                <Td numeric secondaire>{ag.presents != null ? `${ag.presents}/${ag.total}` : "-"}</Td>
                <Td numeric>{ag.pvDispo && <Badge ton="outline">PV</Badge>}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Card>
  );
}

// --- Colonne laterale -----------------------------------------------------

function SideBloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <CardBody padding="sm" className="flex flex-col gap-1.5">
      <Eyebrow as="h4">{titre}</Eyebrow>
      {children}
    </CardBody>
  );
}

function SideIdentite({ copro }: { copro: Copropriete }) {
  return (
    <SideBloc titre="Identité">
      <DataList>
        <DataRow label="Code"><span className="font-mono">{copro.code}</span></DataRow>
        <DataRow label="Statut">{copro.statut === "active" ? "Active" : "Inactive"}</DataRow>
        <DataRow label="Lots principaux">{copro.lotsPrincipaux}</DataRow>
        {copro.lotsAutres > 0 && <DataRow label="Autres lots">{copro.lotsAutres}</DataRow>}
        <DataRow label="Exercice">
          <span className="tabular-nums">{copro.exercice.debut} → {copro.exercice.fin}</span>
        </DataRow>
        <DataRow label="Prise en gestion"><span className="tabular-nums">{copro.priseEnGestion}</span></DataRow>
      </DataList>
    </SideBloc>
  );
}

function SideEquipe({ equipe }: { equipe: MembreEquipe[] }) {
  return (
    <SideBloc titre="Équipe">
      <ul className="flex flex-col">
        {equipe.map((m, i) => (
          <li key={`${m.initiales}-${i}`} className="flex items-center gap-2 min-h-8 text-body">
            <span className="w-6 h-6 rounded-full bg-surface-2 text-ink-2 text-meta font-medium flex items-center justify-center shrink-0">
              {m.initiales}
            </span>
            <span className="font-medium text-ink truncate">{m.nomComplet}</span>
            <span className="text-ink-2 ml-auto shrink-0">{ROLE_LABEL[m.role]}</span>
          </li>
        ))}
      </ul>
    </SideBloc>
  );
}

function SideConseil({
  membres,
  indisponible,
}: {
  membres: MembreConseilSyndical[];
  indisponible?: boolean;
}) {
  return (
    <SideBloc titre="Conseil syndical">
      {membres.length === 0 ? (
        <EmptyState compact>{indisponible ? "ESTALE temporairement indisponible" : "Donnée ESTALE non disponible"}</EmptyState>
      ) : (
        <ul className="flex flex-col text-body">
          {membres.map((m) => (
            <li key={m.nomComplet} className="min-h-7 flex items-center gap-1.5">
              <span className="font-medium text-ink">{m.nomComplet}</span>
              {m.role === "president" && <span className="text-ink-2">(président·e)</span>}
            </li>
          ))}
          {/* Echeance des mandats CS retiree (Sekou 2026-07-28) : la duree d'election du
              conseil n'interesse pas le gestionnaire sur la fiche. */}
        </ul>
      )}
    </SideBloc>
  );
}

const CONFORMITE_STYLE: Record<EtatConformite, string> = {
  ok: "text-ok-700",
  attention: "text-warn-700",
  ko: "text-err-700",
};

function SideConformite({
  items,
  indisponible,
}: {
  items: ItemConformite[];
  indisponible?: boolean;
}) {
  return (
    <SideBloc titre="Conformité">
      {items.length === 0 ? (
        <EmptyState compact>{indisponible ? "ESTALE temporairement indisponible" : "Donnée ESTALE non disponible"}</EmptyState>
      ) : (
        <ul className="flex flex-col text-body">
          {items.map((item) => {
            const Icone = item.etat === "ok" ? CircleCheck : AlertCircle;
            return (
              <li key={item.libelle} className="flex items-center gap-2 min-h-7">
                <Icone strokeWidth={1.5} className={`w-4 h-4 shrink-0 ${CONFORMITE_STYLE[item.etat]}`} aria-hidden />
                <span className={item.etat === "ok" ? "text-ink" : CONFORMITE_STYLE[item.etat]}>{item.libelle}</span>
              </li>
            );
          })}
        </ul>
      )}
    </SideBloc>
  );
}
