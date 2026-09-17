"use client";

import {
  Clock,
  MessageSquare,
  Wrench,
  Paperclip,
  Flag,
  Building2,
  Users,
  Euro,
  Gavel,
  FileText,
  CalendarCheck,
  ChevronRight,
} from "lucide-react";
import type { ContexteCopro, Dossier, EvenementKind } from "@/lib/domain/mes-emails";
import { Button } from "@/components/ui/button";
import { formatDateLongue } from "@/lib/format-date";
import { formatEuros } from "@/lib/domain/format-montant";
import { jourMois } from "./mes-emails.utils";

// Bas du volet de detail : l'historique du dossier rattache et le contexte copro eStale,
// en sections repliables (l'etat « ouvert » est tenu par l'orchestrateur).
export function DetailDossier({
  dossier,
  contexte,
  ouverts,
  onToggleSection,
}: {
  dossier: Dossier | undefined;
  contexte: ContexteCopro | undefined;
  ouverts: Set<string>;
  onToggleSection: (cle: string) => void;
}) {
  return (
    <div>
      {dossier && dossier.historique.length > 0 && (
        <SectionRepliable
          cle="histo"
          titre="Historique du dossier"
          compte={`${dossier.historique.length}`}
          icone={<Clock strokeWidth={1.5} className="w-3.5 h-3.5" />}
          open={ouverts.has("histo")}
          onToggle={onToggleSection}
        >
          <Timeline dossier={dossier} />
        </SectionRepliable>
      )}

      <SectionRepliable
        cle="estale"
        titre="Contexte copropriété - eStale"
        compte={contexte?.disponible ? "réel" : "-"}
        icone={<Building2 strokeWidth={1.5} className="w-3.5 h-3.5" />}
        open={ouverts.has("estale")}
        onToggle={onToggleSection}
      >
        <ContexteCoproContenu ctx={contexte} />
      </SectionRepliable>
    </div>
  );
}

function SectionRepliable({
  cle,
  titre,
  compte,
  icone,
  open,
  onToggle,
  children,
}: {
  cle: string;
  titre: string;
  compte?: string;
  icone: React.ReactNode;
  open: boolean;
  onToggle: (cle: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-line">
      <Button
        onClick={() => onToggle(cle)}
        variant="ghost" size="lg" className="w-full text-left"
      >
        <ChevronRight
          strokeWidth={1.5}
          className={`w-3.5 h-3.5 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {icone}
        {titre}
        {compte && <span className="text-ink-3 font-normal">· {compte}</span>}
      </Button>
      {open && <div className="pb-3 pl-5">{children}</div>}
    </div>
  );
}

const KIND_ICON: Record<EvenementKind, React.ReactNode> = {
  mail: <MessageSquare strokeWidth={1.5} className="w-3.5 h-3.5 text-info-700" />,
  action: <Wrench strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-2" />,
  pj: <Paperclip strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3" />,
  jalon: <Flag strokeWidth={1.5} className="w-3.5 h-3.5 text-green-700" />,
};

function Timeline({ dossier }: { dossier: Dossier }) {
  return (
    <ul className="flex flex-col gap-2.5 border-l border-line pl-3.5 ml-1">
      {dossier.historique.map((e, i) => (
        <li key={`${e.date}-${i}`} className="relative">
          <span className="absolute -left-[22px] top-0.5 w-5 h-5 rounded-full bg-surface border border-line flex items-center justify-center">
            {KIND_ICON[e.kind]}
          </span>
          <p className="text-body text-ink leading-snug">{e.resume}</p>
          <p className="text-meta text-ink-3 mt-0.5">
            {jourMois(e.date)} · {e.acteur}
          </p>
        </li>
      ))}
    </ul>
  );
}

const formatEuro = (n: number) => formatEuros(n, { decimales: 0 });

function Fait({
  icone,
  label,
  children,
}: {
  icone: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-body">
      <span className="text-ink-3 mt-0.5 shrink-0">{icone}</span>
      <p className="text-ink-2">
        <span className="text-ink-3">{label} : </span>
        {children}
      </p>
    </div>
  );
}

function ContexteCoproContenu({ ctx }: { ctx: ContexteCopro | undefined }) {
  if (!ctx || !ctx.disponible) {
    return (
      <p className="text-body text-ink-3 italic">
        Indisponible (copro absente d’eStale, ou eStale non configuré).
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {ctx.conseilSyndical.length > 0 && (
        <Fait icone={<Users strokeWidth={1.5} className="w-3.5 h-3.5" />} label="Conseil syndical">
          {ctx.conseilSyndical
            .map((membre) => `${membre.nomComplet}${membre.role === "president" ? " (président)" : ""}`)
            .join(", ")}
        </Fait>
      )}
      {ctx.derniereAg && (
        <Fait icone={<CalendarCheck strokeWidth={1.5} className="w-3.5 h-3.5" />} label="Dernière AG">
          {formatDateLongue(ctx.derniereAg.date)} ({ctx.derniereAg.type})
          {ctx.derniereAg.pvDispo ? " · PV disponible" : ""}
        </Fait>
      )}
      {(ctx.budgetPrevisionnel !== undefined || ctx.depensesCourantes !== undefined) && (
        <Fait icone={<Euro strokeWidth={1.5} className="w-3.5 h-3.5" />} label="Comptes">
          {ctx.budgetPrevisionnel !== undefined && <>budget {formatEuro(ctx.budgetPrevisionnel)}</>}
          {ctx.depensesCourantes !== undefined && <> · dépenses {formatEuro(ctx.depensesCourantes)}</>}
          {ctx.fondsTravaux !== undefined && <> · fonds travaux {formatEuro(ctx.fondsTravaux)}</>}
          {ctx.nbDebiteurs ? (
            <>
              {" "}
              · {ctx.nbDebiteurs} débiteur{ctx.nbDebiteurs > 1 ? "s" : ""}
            </>
          ) : null}
        </Fait>
      )}
      {ctx.contrats && ctx.contrats.length > 0 && (
        <Fait icone={<FileText strokeWidth={1.5} className="w-3.5 h-3.5" />} label="Contrats">
          {ctx.contrats.map((c) => c.libelle).join(", ")}
        </Fait>
      )}
      {ctx.nbProcedures ? (
        <Fait icone={<Gavel strokeWidth={1.5} className="w-3.5 h-3.5" />} label="Procédures">
          {ctx.nbProcedures} en cours
        </Fait>
      ) : null}
    </div>
  );
}
