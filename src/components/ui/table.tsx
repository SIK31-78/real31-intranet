import type { ComponentProps } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

// Tableau dense : en-tete en capitales sur fond surface-2, lignes de 36 px (32 en
// `dense`), chiffres alignes a droite en tabular-nums. Une ligne cliquable = une
// cellule qui contient <LienLigne> (la ligne est `relative`, le lien la recouvre).
// Rendu serveur, aucun JS.

type TableProps = ComponentProps<"table"> & { dense?: boolean; encadre?: boolean };

export function Table({ dense = false, encadre = true, className, ...props }: TableProps) {
  return (
    <div className={cn("overflow-x-auto", encadre && "border border-line rounded-lg bg-surface shadow-1")}>
      <table
        data-dense={dense || undefined}
        className={cn("w-full border-collapse text-body text-ink", className)}
        {...props}
      />
    </div>
  );
}

export function Thead(props: ComponentProps<"thead">) {
  return <thead {...props} />;
}

export function Tbody(props: ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

type ThProps = ComponentProps<"th"> & { numeric?: boolean };

export function Th({ numeric = false, className, ...props }: ThProps) {
  return (
    <th
      scope="col"
      className={cn(
        "h-8 px-3 first:pl-4 last:pr-4 text-left align-middle whitespace-nowrap",
        "text-meta font-medium uppercase tracking-[0.06em] text-ink-2 bg-surface-2 border-b border-line",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

type TrProps = ComponentProps<"tr"> & {
  /** La ligne contient un <LienLigne> : survol + position relative. */
  interactive?: boolean;
  /** Ligne mise en avant (probleme, retard). */
  ton?: "warn" | "err";
};

export function Tr({ interactive = false, ton, className, ...props }: TrProps) {
  return (
    <tr
      className={cn(
        "border-b border-line last:border-b-0",
        interactive && "relative hover:bg-surface-2/60 transition-colors duration-120",
        ton === "warn" && "bg-warn-50/40",
        ton === "err" && "bg-err-50/40",
        className,
      )}
      {...props}
    />
  );
}

type TdProps = ComponentProps<"td"> & {
  numeric?: boolean;
  /** La cellule principale de la ligne (nom) : ink + medium. */
  principal?: boolean;
  /** Cellule secondaire : ink-2. */
  secondaire?: boolean;
  /** Code copro : mono. */
  code?: boolean;
};

export function Td({ numeric, principal, secondaire, code, className, ...props }: TdProps) {
  return (
    <td
      className={cn(
        "h-9 px-3 first:pl-4 last:pr-4 align-middle [table[data-dense]_&]:h-8",
        numeric && "text-right tabular-nums",
        principal && "font-medium text-ink",
        secondaire && "text-ink-2",
        code && "font-mono text-ink-2",
        className,
      )}
      {...props}
    />
  );
}

/** Lien qui recouvre toute la ligne (a poser dans la cellule principale d'un <Tr interactive>). */
export function LienLigne({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "text-ink font-medium hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded-sm",
        "before:absolute before:inset-0 before:content-['']",
        className,
      )}
      {...props}
    />
  );
}
