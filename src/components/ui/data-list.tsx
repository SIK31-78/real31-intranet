import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

// Liste label / valeur (identite d'une copro, equipe, dates). Le label est le
// SECONDAIRE (ink-2), la valeur est la donnee (ink, medium). Ligne de 28 px.
//   align="right" : label a gauche, valeur a droite (bloc lateral etroit)
//   align="left"  : colonne de labels fixe, valeur qui suit (bloc large)

type DataListProps = ComponentProps<"dl"> & { align?: "right" | "left" };

export function DataList({ align = "right", className, ...props }: DataListProps) {
  return <dl data-align={align} className={cn("flex flex-col text-body", className)} {...props} />;
}

export function DataRow({
  label,
  children,
  ton,
}: {
  label: ReactNode;
  children: ReactNode;
  /** Colore la valeur (statut). */
  ton?: "ok" | "warn" | "err";
}) {
  const couleur = ton === "ok" ? "text-ok-700" : ton === "warn" ? "text-warn-700" : ton === "err" ? "text-err-700" : "text-ink";
  return (
    <div className="group/row flex items-center justify-between gap-3 min-h-7 py-0.5 [dl[data-align=left]_&]:justify-start">
      <dt className="text-ink-2 shrink-0 [dl[data-align=left]_&]:w-36">{label}</dt>
      <dd className={cn("min-w-0 font-medium text-right truncate [dl[data-align=left]_&]:text-left", couleur)}>
        {children}
      </dd>
    </div>
  );
}
