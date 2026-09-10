import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import type { Severite, Ton } from "@/lib/domain/commun";

// Pastille de STATUT (jamais une action). Les chiffres et echeances ("J-81") sont en
// Geist `tabular-nums`, pas en mono : le mono ne sert qu'au code copro.

// `brand` : le vert de marque sur une pastille (rare : nature d'une majorite, source
// eStale). Toleree parce que ce n'est pas un bouton ; ne pas l'utiliser pour un statut.
export type BadgeTon = Ton | "outline" | "brand";
export type BadgeSize = "sm" | "md";

const TONS: Record<BadgeTon, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  ok: "bg-ok-50 text-ok-700 border-transparent",
  warn: "bg-warn-50 text-warn-700 border-transparent",
  err: "bg-err-50 text-err-700 border-transparent",
  info: "bg-info-50 text-info-700 border-transparent",
  outline: "bg-transparent text-ink-2 border-line",
  brand: "bg-green-50 text-green-700 border-transparent",
};

const DOTS: Record<BadgeTon, string> = {
  neutral: "bg-ink-3",
  ok: "bg-ok-500",
  warn: "bg-warn-500",
  err: "bg-err-500",
  info: "bg-info-500",
  outline: "bg-ink-3",
  brand: "bg-green-500",
};

const SIZES: Record<BadgeSize, string> = {
  sm: "h-5 px-1.5 text-meta",
  md: "h-6 px-2 text-body",
};

/** Severite d'un jalon (J-x) -> ton de la pastille. Remplace l'ancienne JalonPill. */
export function tonDeSeverite(severite: Severite): BadgeTon {
  return severite === "late" ? "err" : severite === "soon" ? "warn" : "neutral";
}

type BadgeProps = ComponentProps<"span"> & { ton?: BadgeTon; size?: BadgeSize; dot?: boolean };

export function Badge({ ton = "neutral", size = "sm", dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm font-medium leading-none border tabular-nums whitespace-nowrap",
        SIZES[size],
        TONS[ton],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", DOTS[ton])} />}
      {children}
    </span>
  );
}
