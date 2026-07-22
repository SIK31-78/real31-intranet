"use client";

// Bloc 2 de l'accueil dossiers : "Mes dossiers en cours" (variante C).
// Les dossiers (non clos) du gestionnaire, GROUPES en 3 segments orientes action
// (A traiter / En cours / A clore - cf. domain/dossier.segmentAffaire). Chaque ligne :
// type + copro + etape en cours + barre de progression + [>] vers le fil /dossiers/<id>.
// Filtres v1 : copro, type, toggle [Moi]/[Tout].

import { useMemo, useState } from "react";
import Link from "next/link";
import { Briefcase, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TYPE_DOSSIER_LABEL,
  TYPE_DOSSIER_ORDRE,
  SEGMENT_AFFAIRE_LABEL,
  SEGMENT_AFFAIRE_ORDRE,
  indexEtapeEnCours,
  progressionDossier,
  type Dossier,
  type TypeDossier,
  type SegmentAffaire,
} from "@/lib/domain/dossier";

const TYPE_TON: Record<TypeDossier, "info" | "warn" | "err" | "neutral"> = {
  travaux: "info",
  sinistre: "warn",
  impaye: "err",
  recouvrement: "err",
  procedure: "neutral",
  question_diverse: "neutral",
  autre: "neutral",
};
const SELECT = "h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink";
// Par segment, on n'affiche que les N premiers (depliable) pour ne pas noyer le
// gestionnaire - meme principe que le bandeau AG (retour patron).
const CAP_SEGMENT = 5;

export interface AffaireVue {
  dossier: Dossier;
  segment: SegmentAffaire;
}

// "Moi" / "Tout" v1-light (faute de table d'attribution dediee #1) : on s'appuie sur
// l'assignation de l'ETAPE EN COURS. "Moi" = affaires dont l'etape courante est assignee
// au gestionnaire OU non assignee (par defaut a moi) ; "Tout" = tout le perimetre. Quand
// le canva d'attribution (#1) existera, ce filtre se branchera sur la vraie identite.
function etapeCouranteAssignee(d: Dossier): "gestionnaire" | "assistant" | undefined {
  const i = indexEtapeEnCours(d);
  return i === -1 ? undefined : d.etapes[i]?.assigneA;
}

export function AffairesEnCours({ affaires }: { affaires: AffaireVue[] }) {
  const [filtreType, setFiltreType] = useState<"all" | TypeDossier>("all");
  const [filtreCopro, setFiltreCopro] = useState<"all" | string>("all");
  const [portee, setPortee] = useState<"moi" | "tout">("moi");
  const [deplies, setDeplies] = useState<Set<SegmentAffaire>>(() => new Set());

  // Copros presentes dans les affaires (pour ne proposer que celles-la au filtre).
  const copros = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of affaires) m.set(a.dossier.coproCode, a.dossier.coproNom ?? "");
    return [...m.entries()].map(([code, nom]) => ({ code, nom })).sort((x, y) => x.code.localeCompare(y.code));
  }, [affaires]);

  const visibles = useMemo(
    () =>
      affaires.filter((a) => {
        const d = a.dossier;
        if (filtreType !== "all" && d.type !== filtreType) return false;
        if (filtreCopro !== "all" && d.coproCode !== filtreCopro) return false;
        if (portee === "moi") {
          const who = etapeCouranteAssignee(d);
          if (who === "assistant") return false; // etape courante a l'assistant -> pas "moi"
        }
        return true;
      }),
    [affaires, filtreType, filtreCopro, portee],
  );

  const parSegment = useMemo(() => {
    const m = new Map<SegmentAffaire, AffaireVue[]>(SEGMENT_AFFAIRE_ORDRE.map((s) => [s, []]));
    for (const a of visibles) m.get(a.segment)!.push(a);
    return m;
  }, [visibles]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-md border border-line overflow-hidden">
          {(["moi", "tout"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPortee(p)}
              className={
                "h-8 px-3 text-[13px] font-medium transition-colors " +
                (portee === p ? "bg-green-700 text-white" : "bg-surface text-ink-2 hover:bg-surface-2")
              }
            >
              {p === "moi" ? "Moi" : "Tout"}
            </button>
          ))}
        </div>
        <select value={filtreType} onChange={(e) => setFiltreType(e.target.value as typeof filtreType)} className={SELECT}>
          <option value="all">Tous les types</option>
          {TYPE_DOSSIER_ORDRE.map((t) => (
            <option key={t} value={t}>{TYPE_DOSSIER_LABEL[t]}</option>
          ))}
        </select>
        {copros.length > 0 && (
          <select value={filtreCopro} onChange={(e) => setFiltreCopro(e.target.value)} className={SELECT}>
            <option value="all">Toutes les copros</option>
            {copros.map((c) => (
              <option key={c.code} value={c.code}>{c.code} - {c.nom}</option>
            ))}
          </select>
        )}
        <span className="text-[12px] text-ink-3">
          {visibles.length} dossier{visibles.length > 1 ? "s" : ""}
        </span>
      </div>

      {visibles.length === 0 ? (
        <Card>
          <div className="px-4 py-10 text-center">
            <Briefcase strokeWidth={1.5} className="w-6 h-6 text-ink-4 mx-auto mb-2" />
            <p className="text-[13px] text-ink-3">Aucun dossier en cours pour ce filtre.</p>
          </div>
        </Card>
      ) : (
        SEGMENT_AFFAIRE_ORDRE.map((seg) => {
          const items = parSegment.get(seg)!;
          if (items.length === 0) return null;
          const deplie = deplies.has(seg);
          const affiches = deplie ? items : items.slice(0, CAP_SEGMENT);
          const reste = items.length - affiches.length;
          return (
            <section key={seg}>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3 mb-1.5 px-1">
                {SEGMENT_AFFAIRE_LABEL[seg]} ({items.length})
              </h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {affiches.map((a) => (
                    <LigneAffaire key={a.dossier.id} d={a.dossier} />
                  ))}
                </ul>
                {items.length > CAP_SEGMENT && (
                  <button
                    type="button"
                    onClick={() =>
                      setDeplies((prev) => {
                        const next = new Set(prev);
                        if (next.has(seg)) next.delete(seg);
                        else next.add(seg);
                        return next;
                      })
                    }
                    className="w-full border-t border-line px-4 py-2.5 text-left text-[12px] font-medium text-ink-2 hover:text-green-700 hover:bg-surface-2 transition-colors"
                  >
                    {deplie ? "Réduire" : `Afficher les ${reste} de plus`}
                  </button>
                )}
              </Card>
            </section>
          );
        })
      )}
    </div>
  );
}

function LigneAffaire({ d }: { d: Dossier }) {
  const p = progressionDossier(d);
  const i = indexEtapeEnCours(d);
  const etapeEnCours = i === -1 ? "Tout fait" : d.etapes[i]?.label ?? "";

  return (
    <li>
      <Link
        href={`/dossiers/${d.id}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset"
      >
        <Badge ton={TYPE_TON[d.type]} className="shrink-0 w-[100px] justify-center">
          {TYPE_DOSSIER_LABEL[d.type]}
        </Badge>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-ink truncate">{d.titre}</div>
          <div className="text-[12px] text-ink-3 truncate">
            <span className="font-mono">{d.coproCode}</span> {d.coproNom ?? ""}
            {etapeEnCours ? <span className="text-ink-2"> - {etapeEnCours}</span> : null}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0 w-[120px]">
          <div className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full bg-green-600" style={{ width: `${p.pct}%` }} />
          </div>
          <span className="text-[11px] text-ink-3 font-mono">{p.faites}/{p.total}</span>
        </div>
        <ChevronRight strokeWidth={1.5} className="w-4 h-4 text-ink-4 shrink-0" />
      </Link>
    </li>
  );
}
