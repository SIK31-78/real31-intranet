"use client";

import { cn } from "@/lib/cn";

// Controle segmente NEUTRE : filtres (Moi / Mon equipe), bascule de vue (Liste /
// Pipeline), statut d'un item (OK / Probleme / N/A). Un filtre n'est pas une action :
// il n'est jamais vert. La selection est blanche sur fond surface-2 ; un `ton` par
// option colore la selection quand c'est un STATUT.

export interface OptionSegment<V extends string> {
  value: V;
  label: string;
  /** Statut : colore la selection. */
  ton?: "ok" | "err" | "warn";
  title?: string;
}

const SELECTION_TON = {
  neutre: "bg-surface text-ink shadow-1",
  ok: "bg-ok-50 text-ok-700 border-ok-500/30",
  err: "bg-err-50 text-err-700 border-err-500/30",
  warn: "bg-warn-50 text-warn-700 border-warn-500/30",
} as const;

export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  size = "md",
  label,
  disabled = false,
  /** Recliquer l'option active la desactive (RAZ) : `onChange(null)`. */
  desactivable = false,
}: {
  options: OptionSegment<V>[];
  value: V | null;
  onChange: (v: V | null) => void;
  size?: "sm" | "md";
  /** Libelle accessible du groupe. */
  label: string;
  disabled?: boolean;
  desactivable?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-center rounded-md border border-line bg-surface-2 p-0.5",
        disabled && "opacity-60",
      )}
    >
      {options.map((o) => {
        const actif = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={actif}
            title={o.title}
            onClick={() => onChange(actif && desactivable ? null : o.value)}
            className={cn(
              "inline-flex items-center justify-center rounded-sm border border-transparent text-body font-medium leading-none whitespace-nowrap",
              "transition-colors duration-120 ease-out-quart focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600",
              size === "sm" ? "h-6 px-2" : "h-7 px-2.5",
              actif ? SELECTION_TON[o.ton ?? "neutre"] : "text-ink-2 hover:text-ink",
              disabled && "cursor-not-allowed",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
