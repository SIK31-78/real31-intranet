"use client";

// Fiche detaillee d'un dossier de reprise : en-tete (ref + nom + statut global +
// avancement), colonne de vie groupee par PHASE (Patrimoine / Verification /
// Comptabilite / Mise en service), checklist cochable (cycle des 4 statuts via Server
// Action), et journal (timeline inversee + ajout de note).
//
// Presentation seule + appels aux Server Actions. On EXPOSE fidelement le dossier.ts
// existant ; on ne reinvente pas de modele ni de wizard (le moteur viendra plus tard).

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Minus, Circle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDateLongue } from "@/lib/format-date";
import type { Phase, StatutEtape, StatutDossier } from "@/lib/reprise/domain/dossier";
import { PHASES } from "@/lib/reprise/domain/dossier";
import { majEtapeAction, ajouterNoteAction } from "./actions";

// Vue serialisable d'une etape (ce que la page server projette).
export interface EtapeVue {
  code: string;
  phase: Phase;
  libelle: string;
  statut: StatutEtape;
}

// Vue serialisable d'un dossier pour la fiche.
export interface DossierFicheVue {
  ref: string;
  nomUsuel: string;
  statut: StatutDossier;
  avancement: number; // 0..1
  etapesFaites: number;
  etapesTotal: number;
  etapes: EtapeVue[];
  anomalies: string[];
  journal: { date: string; texte: string }[];
}

const STATUT_DOSSIER_LABEL: Record<StatutDossier, string> = {
  offre: "Offre",
  production: "Production",
  verification: "Verification",
  comptabilite: "Comptabilite",
  finalisation: "Finalisation",
  termine: "Termine",
};

const STATUT_DOSSIER_TON: Record<StatutDossier, "neutral" | "info" | "warn" | "ok"> = {
  offre: "neutral",
  production: "info",
  verification: "warn",
  comptabilite: "warn",
  finalisation: "info",
  termine: "ok",
};

// Libelles humains des phases (ordre = PHASES). OFFRE n'a pas d'etape par defaut mais
// on garde la table complete pour rester robuste si des etapes OFFRE apparaissent.
const PHASE_LABEL: Record<Phase, string> = {
  OFFRE: "Offre",
  PATRIMOINE: "Patrimoine",
  VERIFICATION: "Verification",
  COMPTABILITE: "Comptabilite",
  MISE_EN_SERVICE: "Mise en service",
};

// Cycle de statut au clic sur une etape : a_faire -> en_cours -> fait -> ignore -> a_faire.
const STATUT_SUIVANT: Record<StatutEtape, StatutEtape> = {
  a_faire: "en_cours",
  en_cours: "fait",
  fait: "ignore",
  ignore: "a_faire",
};

const STATUT_ETAPE_LABEL: Record<StatutEtape, string> = {
  a_faire: "A faire",
  en_cours: "En cours",
  fait: "Fait",
  ignore: "Ignore",
};

export function FicheDossierReprise({ dossier }: { dossier: DossierFicheVue }) {
  const pct = Math.round(dossier.avancement * 100);

  // Groupe les etapes par phase, dans l'ordre canonique de PHASES.
  const groupes = PHASES.map((phase) => ({
    phase,
    etapes: dossier.etapes.filter((e) => e.phase === phase),
  })).filter((g) => g.etapes.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/reprise-copro/dossiers"
        className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-green-700 w-fit"
      >
        <ArrowLeft strokeWidth={1.5} className="w-3.5 h-3.5" /> Tous les dossiers
      </Link>

      {/* En-tete */}
      <div className="bg-surface border border-line rounded-md p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[12px] text-ink-2">{dossier.ref}</span>
              <Badge ton={STATUT_DOSSIER_TON[dossier.statut]} dot>
                {STATUT_DOSSIER_LABEL[dossier.statut]}
              </Badge>
            </div>
            <h1 className="text-[20px] font-medium tracking-tight text-ink">{dossier.nomUsuel}</h1>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[22px] font-semibold text-green-700 leading-none">{pct}%</div>
            <div className="mt-1 text-[11px] text-ink-3 font-mono">
              {dossier.etapesFaites}/{dossier.etapesTotal} etapes
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full bg-green-700 transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Anomalies (si presentes) */}
      {dossier.anomalies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Anomalies a traiter ({dossier.anomalies.length})</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-line">
            {dossier.anomalies.map((a, i) => (
              <li key={i} className="px-4 py-2 text-[13px] text-err-700">
                {a}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Colonne de vie : etapes groupees par phase, chacune cochable (cycle de statut). */}
      <Card>
        <CardHeader>
          <CardTitle>Parcours de reprise</CardTitle>
          <span className="text-[11px] text-ink-4">Cliquer une etape la fait avancer</span>
        </CardHeader>
        <div className="flex flex-col">
          {groupes.map((g) => (
            <GroupePhase key={g.phase} dossierRef={dossier.ref} phase={g.phase} etapes={g.etapes} />
          ))}
        </div>
      </Card>

      {/* Journal */}
      <JournalDossier dossierRef={dossier.ref} journal={dossier.journal} />
    </div>
  );
}

function GroupePhase({
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

// Pastille cochable, un rendu par statut :
//  - fait     -> pastille verte pleine + coche
//  - en_cours -> cercle accentue (bordure verte)
//  - a_faire  -> cercle gris vide
//  - ignore   -> pastille discrete barree (Minus)
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

function JournalDossier({
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
      <CardHeader>
        <CardTitle>Journal du dossier</CardTitle>
      </CardHeader>
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
