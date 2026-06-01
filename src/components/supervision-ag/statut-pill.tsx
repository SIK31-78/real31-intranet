import { cn } from "@/lib/cn";
import type { StatutItem } from "@/lib/domain/supervision-ag";

const LIBELLES: Record<StatutItem, string> = {
  ok: "OK",
  probleme: "Problème",
  non_applicable: "N/A",
  non_verifie: "À vérifier",
};

const STYLES: Record<StatutItem, string> = {
  ok: "bg-ok-50 text-ok-700 border-transparent",
  probleme: "bg-err-50 text-err-700 border-transparent",
  non_applicable: "bg-surface-2 text-ink-2 border-line",
  non_verifie: "bg-transparent text-ink-3 border-line border-dashed",
};

type StatutPillProps = {
  statut: StatutItem;
  className?: string;
};

export function StatutPill({ statut, className }: StatutPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center h-[22px] px-2 rounded-sm text-[11.5px] font-medium leading-none border whitespace-nowrap",
        STYLES[statut],
        className,
      )}
    >
      {LIBELLES[statut]}
    </span>
  );
}

export const STATUT_LIBELLES = LIBELLES;
