import Link from "next/link";
import {
  Flag,
  History,
  CircleCheck,
  AlertCircle,
  AlertTriangle,
  FileText,
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
import type { LigneParcours } from "@/lib/domain/dashboard";
import type { EtatCompta } from "@/lib/domain/compta";
import { ComptaPanel } from "@/components/compta/compta-panel";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FriseEtapes } from "@/components/parcours/frise-etapes";
import { formatDateLongue } from "@/lib/format-date";
import { BlocJalons } from "./bloc-jalons";
import { EditeurDate } from "./editeur-date";

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

export function FicheVueEnsemble({ fiche }: { fiche: FicheCopro }) {
  const indispo = Boolean(fiche.estaleIndisponible);
  return (
    <div className="flex flex-col gap-5">
      {indispo && <BanniereEstaleIndispo />}
      {fiche.parcours && <BlocParcours ligne={fiche.parcours} />}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        <div className="flex flex-col gap-5">
          <BlocAg
            coproCode={fiche.copro.code}
            derniere={fiche.derniereAg}
            prochaine={fiche.copro.prochaineAg}
            conformite={fiche.conformite}
            derniereCs={fiche.copro.derniereCsDate}
            prochaineCs={fiche.copro.prochaineCsDate}
          />
          <BlocJalons
            jalons={fiche.jalons}
            coproCode={fiche.copro.code}
            agDate={fiche.copro.prochaineAg?.date ?? ""}
          />
          {fiche.compta && fiche.copro.prochaineAg && (
            <BlocCompta
              coproCode={fiche.copro.code}
              agDate={fiche.copro.prochaineAg.date}
              compta={fiche.compta}
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

// --- Parcours AG (ou en est cette copro + prochaine action) ---------------

function BlocParcours({ ligne }: { ligne: LigneParcours }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Route strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Où en est cette AG
        </CardTitle>
        {ligne.echeance && (
          <Badge
            ton={ligne.enRetard ? "err" : ligne.echeance.startsWith("J-") ? "outline" : "warn"}
            className="font-mono"
            dot={Boolean(ligne.enRetard)}
          >
            {ligne.echeance}
          </Badge>
        )}
      </CardHeader>
      <div className="px-4 py-3.5">
        <FriseEtapes etapes={ligne.etapes} />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[12px] text-ink-3">
            Prochaine action : <span className="text-ink-2">{ligne.prochaineAction}</span>
          </p>
          <Link
            href={ligne.lien}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-sm bg-green-700 text-surface text-[12px] font-medium hover:bg-green-600 transition-colors shrink-0"
          >
            {ligne.actionLabel}
            <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
          </Link>
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
}: {
  coproCode: string;
  agDate: string;
  compta: EtatCompta;
}) {
  const ouvertes = compta.notes.filter((n) => !n.resolu).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Calculator strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Préparation comptable
        </CardTitle>
        {compta.comptesVerifies ? (
          <Badge ton="ok" dot>
            Comptes vérifiés
          </Badge>
        ) : (
          <Badge ton="outline">comptes à vérifier</Badge>
        )}
      </CardHeader>
      <div className="px-4 py-3">
        {ouvertes > 0 && (
          <p className="text-[12px] text-warn-700 mb-2">
            {ouvertes} note{ouvertes > 1 ? "s" : ""} de la comptable à traiter - réponds ici pour
            ne rien oublier.
          </p>
        )}
        <ComptaPanel coproCode={coproCode} agDateISO={agDate} etat={compta} role="gestionnaire" />
      </div>
    </Card>
  );
}

// --- Banniere eStale indisponible (panne passagere) -----------------------

function BanniereEstaleIndispo() {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-warn-500/30 bg-warn-50 px-3.5 py-2.5">
      <AlertTriangle strokeWidth={1.5} className="w-4 h-4 text-warn-700 shrink-0 mt-px" />
      <p className="text-[12.5px] text-warn-700">
        Données eStale temporairement indisponibles (panne passagère du service). Le
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
  prochaine,
  conformite,
  derniereCs,
  prochaineCs,
}: {
  coproCode: string;
  derniere?: AgPassee;
  prochaine?: ProchaineAg;
  conformite: ItemConformite[];
  derniereCs?: string;
  prochaineCs?: string;
}) {
  const agAJour = conformite.find((c) => c.libelle.toLowerCase().includes("ag annuelle"));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Flag strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Assemblées générales
        </CardTitle>
        <div className="flex items-center gap-2">
          {agAJour?.etat === "ok" && <Badge ton="ok" dot>À jour</Badge>}
          {!prochaine && (
            <>
              <Link
                href={`/odj/${coproCode}`}
                className="inline-flex items-center h-7 px-2.5 rounded-sm border border-line bg-surface text-[12px] font-medium text-ink-2 hover:border-line-2 hover:text-ink transition-colors"
              >
                ODJ
              </Link>
              <Link
                href={`/supervision-ag/${coproCode}`}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-sm bg-green-700 text-surface text-[12px] font-medium hover:bg-green-600 transition-colors"
              >
                Supervision AG
                <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
              </Link>
            </>
          )}
        </div>
      </CardHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line">
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-[0.5px] text-ink-3 mb-1">
            Dernière AG tenue
          </p>
          {derniere ? (
            <>
              <p className="text-[16px] font-medium text-ink">{formatDateLongue(derniere.date)}</p>
              <p className="mt-1.5 text-[12px] text-ink-3">
                {derniere.type === "AGE" ? "AGE" : "AG ordinaire"}
                {derniere.presents != null
                  ? ` · ${derniere.presents} présents/représentés sur ${derniere.total}`
                  : ""}
              </p>
              {derniere.pvDispo && (
                <span className="mt-2 inline-flex items-center gap-1 text-[12px] text-info-700">
                  <FileText strokeWidth={1.5} className="w-3.5 h-3.5" /> Voir le PV
                </span>
              )}
            </>
          ) : (
            <p className="text-[13px] text-ink-3">Aucune AG enregistrée.</p>
          )}
        </div>

        <div className="p-4">
          <p className="text-[11px] uppercase tracking-[0.5px] text-ink-3 mb-1">Prochaine AG</p>
          <EditeurDate coproCode={coproCode} type="ag" dateISO={prochaine?.date} />
          {prochaine && (
            <>
              <p className="mt-1.5 text-[12px] text-ink-3">{STATUT_AG_LABEL[prochaine.statut]}</p>
              {prochaine.alerte && (
                <p className="mt-1 text-[12px] text-warn-700 flex items-center gap-1">
                  <AlertCircle strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" />
                  {prochaine.alerte}
                </p>
              )}
              {prochaine.supervisionId && (
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
            <span className="text-[12px] text-ink-3">Dernier CS :</span>
            <span className="text-[13px] font-medium text-ink">
              {derniereCs ? formatDateLongue(derniereCs) : "-"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] text-ink-3 shrink-0">Prochain CS :</span>
            <EditeurDate coproCode={coproCode} type="cs" dateISO={prochaineCs} />
          </div>
        </div>
      </div>
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
              {ag.pvDispo && (
                <span className="text-[12px] text-info-700 shrink-0">PV</span>
              )}
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
          {indisponible ? "eStale temporairement indisponible." : "Donnée eStale - non disponible."}
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
          {indisponible ? "eStale temporairement indisponible." : "Donnée eStale - non disponible."}
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
