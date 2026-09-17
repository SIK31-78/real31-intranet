"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Check, CloudUpload, Loader2, Redo2, Undo2 } from "lucide-react";
import { statutGlobal, type StatutSauvegarde } from "@/lib/domain/odj-brouillon";
import { Button } from "@/components/ui/button";
import type { MoteurAutosave } from "./use-autosave-odj";

/** Barre de sauvegarde : annuler / refaire + statut + bouton Enregistrer. */
export function BarreSauvegarde({ moteur }: { moteur: MoteurAutosave }) {
  const statut = statutGlobal(moteur.brouillons);
  const rendu: Record<StatutSauvegarde, ReactNode> = {
    repos: <span className="text-ink-2">Les modifications s&apos;enregistrent automatiquement</span>,
    "en-attente": <span className="text-ink-2">Modifications en attente…</span>,
    enregistrement: (
      <span className="inline-flex items-center gap-1.5 text-ink-2">
        <Loader2 strokeWidth={1.5} className="w-3.5 h-3.5 animate-spin" />
        Enregistrement…
      </span>
    ),
    enregistre: (
      <span className="inline-flex items-center gap-1.5 text-ok-700">
        <Check strokeWidth={1.5} className="w-3.5 h-3.5" />
        Enregistré
      </span>
    ),
    erreur: (
      <span className="inline-flex items-center gap-1.5 text-err-700">
        <AlertTriangle strokeWidth={1.5} className="w-3.5 h-3.5" />
        Échec d&apos;enregistrement, réessayez
      </span>
    ),
  };
  return (
    <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface shadow-1/95 backdrop-blur px-2 h-10 shadow-2">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          title="Annuler (Ctrl+Z)"
          aria-label="Annuler"
          onClick={moteur.annulerGeste}
          disabled={moteur.historique.annulables.length === 0}
        >
          <Undo2 strokeWidth={1.5} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          title="Rétablir (Ctrl+Y)"
          aria-label="Rétablir"
          onClick={moteur.refaireGeste}
          disabled={moteur.historique.refaisables.length === 0}
        >
          <Redo2 strokeWidth={1.5} />
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-body">{rendu[statut]}</span>
        <Button variant="secondary" size="sm" onClick={moteur.envoyer} disabled={statut === "enregistrement"}>
          <CloudUpload strokeWidth={1.5} />
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

