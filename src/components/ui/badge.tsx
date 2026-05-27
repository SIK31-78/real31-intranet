import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import type { Ton } from "@/lib/domain/commun";

type BadgeTon = Ton | "brand" | "outline";

const TONS: Record<BadgeTon, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  ok: "bg-ok-50 text-ok-700 border-transparent",
  warn: "bg-warn-50 text-warn-700 border-transparent",
  err: "bg-err-50 text-err-700 border-transparent",
  info: "bg-info-50 text-info-700 border-transparent",
  brand: "bg-green-50 text-green-700 border-transparent",
  outline: "bg-transparent text-ink-2 border-line",
};

const DOTS: Record<BadgeTon, string> = {
  neutral: "bg-ink-3",
  ok: "bg-ok-500",
  warn: "bg-warn-500",
  err: "bg-err-500",
  info: "bg-info-500",
  brand: "bg-green-500",
  outline: "bg-ink-3",
};

type BadgeProps = ComponentProps<"span"> & { ton?: BadgeTon; dot?: boolean };

export function Badge({ ton = "neutral", dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-5 px-1.5 rounded-[4px] text-[11.5px] font-medium leading-none border",
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
