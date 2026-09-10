import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// Sur-titre en capitales : le SEUL style d'eyebrow de l'app (11 px, tracking 0.06em,
// ink-2). Sert aux titres de groupe de la sidebar, aux blocs lateraux, aux colonnes.

type EyebrowProps = ComponentProps<"p"> & { as?: "p" | "h3" | "h4" | "span" | "dt" };

export function Eyebrow({ as: Tag = "p", className, ...props }: EyebrowProps) {
  return (
    <Tag
      className={cn("text-meta font-medium uppercase tracking-[0.06em] text-ink-2", className)}
      {...props}
    />
  );
}
