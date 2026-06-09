import Link from "next/link";
import {
  Trophy,
  CheckSquare,
  Flag,
  Building2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import type {
  ActionATraiter,
  AgAVenir,
  CoproSansAg,
  MesEvenements,
} from "@/lib/domain/mes-evenements";
import { progressionPct } from "@/lib/domain/mes-evenements";
import type { Severite } from "@/lib/domain/commun";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateLongue } from "@/lib/format-date";

const SEVERITE_DOT: Record<Severite, string> = {
  late: "bg-err-500",
  soon: "bg-warn-500",
  ok: "bg-ink-3",
};

const SEVERITE_FILL: Record<Severite, string> = {
  late: "bg-err-500",
  soon: "bg-warn-500",
  ok: "bg-green-500",
};

/** "2026-05-28" -> "28 mai" (sans l'annee). */
function jourMois(iso: string): string {
  return formatDateLongue(iso).replace(/ \d{4}$/, "");
}

export function MesEvenementsVue({ data }: { data: MesEvenements }) {
  return (
    <div className="flex flex-col gap-6">
      <EnTete data={data} />
      <Compteur actionsCeMois={data.actionsCeMois} />

      <Section
        icone={<CheckSquare strokeWidth={1.5} className="w-4 h-4 text-ink-3" />}
        titre="À traiter en priorité"
        compte={`${data.aTraiter.length} actions ouvertes`}
      >
        {data.aTraiter.map((a) => (
          <ActionRow key={a.id} action={a} />
        ))}
      </Section>

      <Section
        icone={<Flag strokeWidth={1.5} className="w-4 h-4 text-ink-3" />}
        titre="Mes AG à venir (90 jours)"
        compte={`${data.agAVenir.length} AG planifiées`}
      >
        {data.agAVenir.map((ag) => (
          <AgRow key={ag.id} ag={ag} />
        ))}
      </Section>

      <Section
        icone={<Building2 strokeWidth={1.5} className="w-4 h-4 text-ink-3" />}
        titre="Mes copros sans AG planifiée"
        compte={`${data.coprosSansAg.length} copros`}
      >
        {data.coprosSansAg.map((c) => (
          <SansAgRow key={c.coproCode} copro={c} />
        ))}
      </Section>
    </div>
  );
}

function EnTete({ data }: { data: MesEvenements }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-full bg-info-50 text-info-700 text-[14px] font-medium flex items-center justify-center shrink-0">
          {data.gestionnaire.initiales}
        </span>
        <div>
          <h1 className="text-[20px] font-medium tracking-tight text-ink">
            Bonjour, {data.gestionnaire.nomComplet.split(" ")[0]}
          </h1>
          <p className="text-[13px] text-ink-3 mt-0.5">
            {data.nbCopros} copropriétés sous votre gestion · {data.dateCourante}
          </p>
        </div>
      </div>
    </div>
  );
}

function Compteur({ actionsCeMois }: { actionsCeMois: number }) {
  return (
    <Card className="flex items-center gap-4 px-5 py-4">
      <Trophy strokeWidth={1.5} className="w-7 h-7 text-info-700 shrink-0" />
      <div className="flex-1">
        <p className="text-[14px] font-medium text-ink">{actionsCeMois} actions traitées ce mois</p>
        <p className="text-[12px] text-ink-3 mt-0.5">Bon rythme — +3 vs mai dernier.</p>
      </div>
      <p className="text-[28px] font-medium leading-none text-info-700">{actionsCeMois}</p>
    </Card>
  );
}

function Section({
  icone,
  titre,
  compte,
  children,
}: {
  icone: React.ReactNode;
  titre: string;
  compte: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[14px] font-semibold text-ink flex items-center gap-1.5">
          {icone}
          {titre}
        </h2>
        <span className="text-[12px] text-ink-3">{compte}</span>
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">{children}</ul>
      </Card>
    </section>
  );
}

function LienTraiter({ href, libelle }: { href?: string; libelle: string }) {
  const classes =
    "shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-md border border-line bg-surface text-[13px] text-ink hover:bg-surface-2 transition-colors";
  if (!href) {
    return <span className={`${classes} opacity-50 cursor-not-allowed`}>{libelle}</span>;
  }
  return (
    <Link href={href} className={classes}>
      {libelle}
      <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
    </Link>
  );
}

function ActionRow({ action }: { action: ActionATraiter }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className={`w-2 h-2 rounded-full shrink-0 ${SEVERITE_DOT[action.severite]}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-ink">{action.titre}</span>
          <Badge ton={action.badge.ton}>{action.badge.texte}</Badge>
        </div>
        <p className="text-[12px] text-ink-3 mt-0.5 truncate">{action.contexte}</p>
      </div>
      <LienTraiter href={action.lien} libelle="Traiter" />
    </li>
  );
}

function AgRow({ ag }: { ag: AgAVenir }) {
  const pct = progressionPct(ag.jalonsFaits, ag.jalonsTotal);
  const contenu = (
    <>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge ton="outline" className="font-mono shrink-0">AG</Badge>
          <span className="text-[14px] font-medium text-ink truncate">
            {ag.coproCode} · {ag.coproNom}
          </span>
          <span className="text-[11px] text-ink-3 shrink-0">
            {jourMois(ag.date)}{ag.heure ? ` · ${ag.heure}` : ""}
          </span>
        </div>
        <Badge ton={ag.badge.ton} className="shrink-0">{ag.badge.texte}</Badge>
      </div>
      <div className="flex items-center gap-3 mb-1.5">
        <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div
            className={`h-full rounded-full ${SEVERITE_FILL[ag.prochainJalonSeverite]}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] text-ink-3 min-w-[70px] text-right">
          {ag.jalonsFaits} / {ag.jalonsTotal} jalons
        </span>
      </div>
      <p
        className={`text-[12px] flex items-center gap-1 ${ag.prochainJalonSeverite === "late" ? "text-err-700" : "text-ink-3"}`}
      >
        {ag.prochainJalonSeverite === "late" && (
          <AlertCircle strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" />
        )}
        Prochain jalon : {ag.prochainJalon}
      </p>
    </>
  );

  return (
    <li>
      {ag.lien ? (
        <Link href={ag.lien} className="block px-4 py-3.5 hover:bg-surface-2 transition-colors">
          {contenu}
        </Link>
      ) : (
        <div className="px-4 py-3.5">{contenu}</div>
      )}
    </li>
  );
}

function SansAgRow({ copro }: { copro: CoproSansAg }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-ink">
          {copro.coproCode} · {copro.coproNom}
        </p>
        <p
          className={`text-[12px] mt-0.5 flex items-center gap-1 ${copro.severite === "late" ? "text-err-700" : "text-ink-3"}`}
        >
          {copro.severite === "late" && (
            <AlertCircle strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" />
          )}
          {copro.detail}
        </p>
      </div>
      <LienTraiter href={copro.lien} libelle="Planifier" />
    </li>
  );
}
