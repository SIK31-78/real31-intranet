"use client";

import { cn } from "@/lib/cn";
import type { TypeEvenement } from "@/lib/domain/calendrier";

const TYPES: { value: TypeEvenement; label: string }[] = [
  { value: "AG", label: "AG" },
  { value: "AGE", label: "AGE" },
  { value: "CS", label: "CS" },
];

type FiltresBarProps = {
  typesActifs: TypeEvenement[];
  onToggleType: (t: TypeEvenement) => void;
};

export function FiltresBar({ typesActifs, onToggleType }: FiltresBarProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.08em] text-ink-3 mr-0.5">
        Type
      </span>
      {TYPES.map((t) => {
        const actif = typesActifs.includes(t.value);
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onToggleType(t.value)}
            aria-pressed={actif}
            className={cn(
              "h-7 px-2.5 rounded-sm border text-[12px] font-medium transition-colors duration-75",
              actif
                ? "bg-green-700 text-surface border-green-700"
                : "bg-surface text-ink-2 border-line hover:border-line-2",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
