"use client";

// ZONES SUIVI HUMAIN + JOURNAL de la fiche-hub (refonte 2026-08, extraites de
// fiche-dossier-reprise.tsx) : frise des phases, checklist des etapes reelles R1..R11
// (cases cochables par tout gestionnaire) et journal du dossier (timeline + note).

import { useState, useTransition } from "react";
import { Check, Minus, Circle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDateLongue } from "@/lib/format-date";
import { PHASES } from "@/lib/reprise/domain/dossier";
import type { Phase, StatutEtape } from "@/lib/reprise/domain/dossier";
import { majEtapeAction, ajouterNoteAction } from "./actions";
import { PHASE_LABEL, STATUT_SUIVANT, STATUT_ETAPE_LABEL, type EtapeVue } from "./vues";

// --- ZONE 3 : SUIVI HUMAIN --------------------------------------------------

// Frise des phases : etat d'avancement de chaque grande phase (part des etapes faites).
export function FrisePhases({ etapes }: { etapes: EtapeVue[] }) {
  const groupes = PHASES.map((phase) => {
    const liste = etapes.filter((e) => e.phase === phase);
    const faites = liste.filter((e) => e.statut === "fait" || e.statut === "ignore").length;
    return { phase, total: liste.length, faites };
  }).filter((gr) => gr.total > 0);

  return (
    <div className="px-4 py-3 border-b border-line flex items-stretch gap-2 overflow-x-auto">
      {groupes.map((gr) => {
        const complet = gr.faites === gr.total;
        const entame = gr.faites > 0 && !complet;
        return (
          <div
            key={gr.phase}
            className={cn(
              "flex-1 min-w-[120px] rounded-md border px-2.5 py-1.5",
              complet && "border-green-600/40 bg-green-50",
              entame && "border-info-500/30 bg-info-50",
              !complet && !entame && "border-line bg-surface-2",
            )}
          >
            <div className="text-[11px] font-semibold text-ink-2 truncate">{PHASE_LABEL[gr.phase]}</div>
            <div className={cn("text-[11px] font-mono", complet ? "text-green-700" : "text-ink-3")}>
              {gr.faites}/{gr.total}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GroupePhase({
  dossierRef,
  phase,
  etapes,
}: {
  dossierRef: string;
  phase: Phase;
  etapes: EtapeVue[];
}) {
  return (
    <div className="border-b border-line last:border-b-0">
      <div className="px-4 pt-3 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          {PHASE_LABEL[phase]}
        </span>
      </div>
      <ul>
        {etapes.map((e) => (
          <LigneEtape key={e.code} dossierRef={dossierRef} etape={e} />
        ))}
      </ul>
    </div>
  );
}

function LigneEtape({ dossierRef, etape }: { dossierRef: string; etape: EtapeVue }) {
  const [statut, setStatut] = useState<StatutEtape>(etape.statut);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const cycler = () => {
    const suivant = STATUT_SUIVANT[statut];
    const precedent = statut;
    setStatut(suivant); // optimiste
    startTransition(async () => {
      const r = await majEtapeAction(dossierRef, etape.code, suivant);
      if (r.ok) {
        toast.ok(`${etape.code} : ${STATUT_ETAPE_LABEL[suivant]}.`);
      } else {
        setStatut(precedent); // rollback
        toast.err(r.message);
      }
    });
  };

  return (
    <li className="flex items-center gap-2.5 px-4 py-2">
      <button
        type="button"
        onClick={cycler}
        disabled={pending}
        aria-label={`Etape ${etape.code} : ${STATUT_ETAPE_LABEL[statut]} (cliquer pour changer)`}
        title={`${STATUT_ETAPE_LABEL[statut]} - cliquer pour changer`}
        className="shrink-0 disabled:opacity-50"
      >
        <PastilleEtape statut={statut} />
      </button>
      <span className="font-mono text-[11px] text-ink-3 w-12 shrink-0">{etape.code}</span>
      <span
        className={cn(
          "flex-1 min-w-0 text-[13px]",
          statut === "fait" && "text-ink-2",
          statut === "en_cours" && "text-green-700 font-medium",
          statut === "a_faire" && "text-ink",
          statut === "ignore" && "text-ink-4 line-through",
        )}
      >
        {etape.libelle}
      </span>
      <Badge ton={BADGE_TON[statut]} className="shrink-0">
        {STATUT_ETAPE_LABEL[statut]}
      </Badge>
    </li>
  );
}

const BADGE_TON: Record<StatutEtape, "neutral" | "info" | "ok"> = {
  a_faire: "neutral",
  en_cours: "info",
  fait: "ok",
  ignore: "neutral",
};

// Pastille cochable, un rendu par statut.
function PastilleEtape({ statut }: { statut: StatutEtape }) {
  const base = "w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors";
  if (statut === "fait") {
    return (
      <span className={cn(base, "bg-green-700 text-white")} aria-hidden>
        <Check strokeWidth={3} className="w-3 h-3" />
      </span>
    );
  }
  if (statut === "en_cours") {
    return (
      <span className={cn(base, "bg-surface border-2 border-green-700 text-green-700")} aria-hidden>
        <Circle strokeWidth={0} className="w-2 h-2 fill-green-700" />
      </span>
    );
  }
  if (statut === "ignore") {
    return (
      <span className={cn(base, "bg-surface-2 border border-line text-ink-4")} aria-hidden>
        <Minus strokeWidth={2} className="w-3 h-3" />
      </span>
    );
  }
  return <span className={cn(base, "bg-surface border border-line")} aria-hidden />;
}

// --- ZONE 4 : JOURNAL -------------------------------------------------------

export function JournalDossier({
  dossierRef,
  journal,
}: {
  dossierRef: string;
  journal: { date: string; texte: string }[];
}) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const envoyer = () => {
    const t = note.trim();
    if (!t) return;
    startTransition(async () => {
      const r = await ajouterNoteAction(dossierRef, t);
      if (r.ok) {
        toast.ok("Note ajoutee.");
        setNote("");
      } else {
        toast.err(r.message);
      }
    });
  };

  return (
    <Card>
      <div className="px-4 py-3 border-b border-line flex items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && envoyer()}
          placeholder="Ajouter une note..."
          className="flex-1 h-8 px-2.5 rounded-md border border-line bg-surface text-[13px] text-ink"
        />
        <button
          type="button"
          onClick={envoyer}
          disabled={!note.trim() || pending}
          className="h-8 px-3 rounded-md bg-green-700 text-white text-[12px] font-medium hover:bg-green-600 disabled:opacity-50 shrink-0"
        >
          Noter
        </button>
      </div>
      {journal.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-ink-3 text-center">Aucune entree pour le moment.</p>
      ) : (
        <ul className="divide-y divide-line">
          {[...journal].reverse().map((ev, idx) => (
            <li key={idx} className="flex items-start gap-2.5 px-4 py-2.5">
              <MessageSquare strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink">{ev.texte}</p>
                <p className="text-[11px] text-ink-4 mt-0.5">{formatDateLongue(ev.date.slice(0, 10))}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

