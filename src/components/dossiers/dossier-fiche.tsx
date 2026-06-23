"use client";

// Fiche dossier : en-tete + statut, etapes EDITABLES (le workflow n'est pas fige),
// journal/timeline typee. Brique 1 (manuel). Decision Sekou 2026-06-23.

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Plus, Trash2, ChevronUp, ChevronDown, MessageSquare, Flag, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDateLongue } from "@/lib/format-date";
import {
  TYPE_DOSSIER_LABEL,
  STATUT_DOSSIER_LABEL,
  PORTEE_LABEL,
  progressionDossier,
  type Dossier,
  type EtapeDossier,
  type StatutDossier,
  type KindEvenement,
} from "@/lib/domain/dossier";
import { majEtapesAction, ajouterNoteAction, changerStatutAction } from "@/app/dossiers/actions";

const KIND_ICON: Record<KindEvenement, typeof Flag> = {
  note: MessageSquare,
  etape: Check,
  statut: Flag,
  email: Mail,
  appel: Phone,
};

function uid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

export function DossierFiche({ dossier }: { dossier: Dossier }) {
  const [etapes, setEtapes] = useState<EtapeDossier[]>(dossier.etapes);
  const [nouvelle, setNouvelle] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const p = progressionDossier({ ...dossier, etapes });

  const sauver = (next: EtapeDossier[]) => {
    setEtapes(next);
    startTransition(() => majEtapesAction(dossier.id, next));
  };
  const toggle = (id: string) => sauver(etapes.map((e) => (e.id === id ? { ...e, fait: !e.fait } : e)));
  const supprimer = (id: string) => sauver(etapes.filter((e) => e.id !== id));
  const renommer = (id: string, label: string) => setEtapes(etapes.map((e) => (e.id === id ? { ...e, label } : e)));
  const deplacer = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= etapes.length) return;
    const next = [...etapes];
    [next[i], next[j]] = [next[j], next[i]];
    sauver(next);
  };
  const ajouter = () => {
    const label = nouvelle.trim();
    if (!label) return;
    sauver([...etapes, { id: uid(), label, fait: false }]);
    setNouvelle("");
  };
  const changerStatut = (statut: StatutDossier) => startTransition(() => changerStatutAction(dossier.id, statut));
  const envoyerNote = () => {
    const t = note.trim();
    if (!t) return;
    startTransition(async () => {
      await ajouterNoteAction(dossier.id, t);
      toast.ok("Note ajoutée.");
    });
    setNote("");
  };

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dossiers" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-green-700 w-fit">
        <ArrowLeft strokeWidth={1.5} className="w-3.5 h-3.5" /> Tous les dossiers
      </Link>

      <div className="bg-surface border border-line rounded-md p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge ton="outline">{TYPE_DOSSIER_LABEL[dossier.type]}</Badge>
              <span className="text-[12px] text-ink-3">
                {PORTEE_LABEL[dossier.portee]}{dossier.cible ? ` - ${dossier.cible}` : ""}
              </span>
            </div>
            <h1 className="text-[20px] font-medium tracking-tight text-ink">{dossier.titre}</h1>
            <p className="mt-1 text-[13px] text-ink-3">
              <span className="font-mono">{dossier.coproCode}</span> {dossier.coproNom ?? ""}
              {dossier.origine ? ` · Origine : ${dossier.origine}` : ""}
            </p>
          </div>
          <label className="flex flex-col gap-1 text-[11px] text-ink-3 shrink-0">
            Statut
            <select
              value={dossier.statut}
              onChange={(e) => changerStatut(e.target.value as StatutDossier)}
              disabled={pending}
              className="h-8 rounded-md border border-line bg-surface px-2 text-[13px]"
            >
              {(["ouvert", "en_cours", "clos"] as StatutDossier[]).map((s) => (
                <option key={s} value={s}>{STATUT_DOSSIER_LABEL[s]}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full bg-green-700 transition-[width] duration-200" style={{ width: `${p.pct}%` }} />
          </div>
          <span className="text-[11px] text-ink-3 font-mono">{p.faites}/{p.total}</span>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Étapes du dossier</CardTitle></CardHeader>
        <div className="divide-y divide-line">
          {etapes.map((e, i) => (
            <div key={e.id} className="flex items-center gap-2 px-4 py-2">
              <button
                type="button"
                onClick={() => toggle(e.id)}
                aria-pressed={e.fait}
                aria-label={e.fait ? "Décocher" : "Cocher"}
                className={cn(
                  "w-5 h-5 rounded-sm border flex items-center justify-center shrink-0 transition-colors",
                  e.fait ? "bg-green-700 border-green-700 text-white" : "border-line hover:border-line-2",
                )}
              >
                {e.fait && <Check strokeWidth={3} className="w-3 h-3" />}
              </button>
              <input
                value={e.label}
                onChange={(ev) => renommer(e.id, ev.target.value)}
                onBlur={() => sauver(etapes)}
                className={cn(
                  "flex-1 min-w-0 bg-transparent text-[13px] focus:outline-none",
                  e.fait ? "line-through text-ink-3" : "text-ink",
                )}
              />
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" onClick={() => deplacer(i, -1)} disabled={i === 0} aria-label="Monter" className="p-1 text-ink-4 hover:text-ink-2 disabled:opacity-30">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => deplacer(i, 1)} disabled={i === etapes.length - 1} aria-label="Descendre" className="p-1 text-ink-4 hover:text-ink-2 disabled:opacity-30">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => supprimer(e.id)} aria-label="Supprimer" className="p-1 text-ink-4 hover:text-err-700">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 px-4 py-2">
            <Plus strokeWidth={1.5} className="w-4 h-4 text-ink-4 shrink-0" />
            <input
              value={nouvelle}
              onChange={(e) => setNouvelle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ajouter()}
              placeholder="Ajouter une étape..."
              className="flex-1 bg-transparent text-[13px] focus:outline-none placeholder:text-ink-4"
            />
            {nouvelle.trim() && (
              <button type="button" onClick={ajouter} className="text-[12px] text-green-700 font-medium shrink-0">Ajouter</button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Journal du dossier</CardTitle></CardHeader>
        <div className="px-4 py-3 border-b border-line flex items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && envoyerNote()}
            placeholder="Ajouter une note..."
            className="flex-1 h-8 px-2.5 rounded-md border border-line bg-surface text-[13px]"
          />
          <button
            type="button"
            onClick={envoyerNote}
            disabled={!note.trim() || pending}
            className="h-8 px-3 rounded-md bg-green-700 text-white text-[12px] font-medium hover:bg-green-600 disabled:opacity-50 shrink-0"
          >
            Noter
          </button>
        </div>
        {dossier.journal.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-ink-3 text-center">Aucune entrée pour le moment.</p>
        ) : (
          <ul className="divide-y divide-line">
            {[...dossier.journal].reverse().map((ev, idx) => {
              const Icon = KIND_ICON[ev.kind] ?? MessageSquare;
              return (
                <li key={idx} className="flex items-start gap-2.5 px-4 py-2.5">
                  <Icon strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink">{ev.texte}</p>
                    <p className="text-[11px] text-ink-4 mt-0.5">{ev.par} · {formatDateLongue(ev.le.slice(0, 10))}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
