import Link from "next/link";
import {
  Flag,
  CalendarClock,
  History,
  CircleCheck,
  AlertCircle,
  FileText,
  ArrowRight,
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
import type { Evenement } from "@/lib/domain/calendrier";
import type { Severite } from "@/lib/domain/commun";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateLongue } from "@/lib/format-date";

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

const SEVERITE_TON: Record<Severite, "err" | "warn" | "ok"> = {
  late: "err",
  soon: "warn",
  ok: "ok",
};

export function FicheVueEnsemble({ fiche }: { fiche: FicheCopro }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
      <div className="flex flex-col gap-5">
        <BlocAg
          derniere={fiche.derniereAg}
          prochaine={fiche.copro.prochaineAg}
          conformite={fiche.estale.conformite}
        />
        <ProchainsEvenements evenements={fiche.prochains} />
        <HistoriqueAg historique={fiche.historique} />
      </div>

      <div className="flex flex-col gap-3">
        <SideIdentite copro={fiche.copro} />
        <SideEquipe equipe={fiche.copro.equipe} />
        <SideConseil
          membres={fiche.estale.conseilSyndical}
          mandatJusqua={fiche.estale.mandatJusqua}
        />
        <SideConformite items={fiche.estale.conformite} />
      </div>
    </div>
  );
}

// --- Bloc AG (derniere tenue + prochaine) ---------------------------------

function BlocAg({
  derniere,
  prochaine,
  conformite,
}: {
  derniere?: AgPassee;
  prochaine?: ProchaineAg;
  conformite: ItemConformite[];
}) {
  const agAJour = conformite.find((c) => c.libelle.toLowerCase().includes("ag annuelle"));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Flag strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Assemblées générales
        </CardTitle>
        {agAJour?.etat === "ok" && (
          <Badge ton="ok" dot>À jour</Badge>
        )}
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
          {prochaine ? (
            <>
              <p className="text-[16px] font-medium text-ink">{formatDateLongue(prochaine.date)}</p>
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
                  Ouvrir la fiche de préparation
                  <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
                </Link>
              )}
            </>
          ) : (
            <p className="text-[13px] text-ink-3">Aucune AG planifiée.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

// --- Prochains evenements -------------------------------------------------

function ProchainsEvenements({ evenements }: { evenements: Evenement[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <CalendarClock strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Prochains événements
        </CardTitle>
        <Link href="/calendrier" className="text-[12px] text-info-700 hover:underline">
          Voir tout
        </Link>
      </CardHeader>

      {evenements.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-ink-3">Aucun événement à venir.</p>
      ) : (
        <ul className="divide-y divide-line">
          {evenements.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-3">
              <span className="font-mono text-[11px] text-ink-3 w-[68px] shrink-0">
                {formatDateLongue(e.date).replace(/ \d{4}$/, "")}
                {e.heure ? ` · ${e.heure}` : ""}
              </span>
              <Badge ton="outline" className="font-mono shrink-0">{e.type}</Badge>
              <span className="text-[13px] text-ink flex-1 truncate">{e.coproNomCourt}</span>
              {e.jalon && (
                <Badge ton={SEVERITE_TON[e.jalon.severite]} className="font-mono shrink-0">
                  {e.jalon.label}
                </Badge>
              )}
            </li>
          ))}
        </ul>
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
      <SideRow label="Exercice" value={`${copro.exercice.debut} → ${copro.exercice.fin}`} />
      <SideRow label="Prise en gestion" value={copro.priseEnGestion} />
    </SideBox>
  );
}

function SideEquipe({ equipe }: { equipe: MembreEquipe[] }) {
  return (
    <SideBox titre="Équipe">
      <div className="flex flex-col gap-2">
        {equipe.map((m) => (
          <div key={m.initiales} className="flex items-center gap-2">
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
}: {
  membres: MembreConseilSyndical[];
  mandatJusqua?: string;
}) {
  return (
    <SideBox titre="Conseil Syndical">
      {membres.length === 0 ? (
        <p className="text-[12px] text-ink-3">Donnée eStale — non disponible.</p>
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

function SideConformite({ items }: { items: ItemConformite[] }) {
  return (
    <SideBox titre="Conformité">
      {items.length === 0 ? (
        <p className="text-[12px] text-ink-3">Donnée eStale — non disponible.</p>
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
