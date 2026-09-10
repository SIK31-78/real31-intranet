import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// Une Card GROUPE des choses liees ; elle n'est PAS un fond. Un titre de page, un
// tableau seul, un etat vide, une liste de sections n'en ont pas besoin. Blanche,
// rayon 12, en relief doux (shadow-1) sur le papier. Le padding est porte par CardHeader / CardBody / CardFooter,
// pas par l'appelant.

type CardProps = ComponentProps<"div"> & {
  /** Toute la carte est un lien / un bouton : bordure qui reagit au survol. */
  interactive?: boolean;
};

export function Card({ className, interactive = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-surface border border-line rounded-lg shadow-1",
        interactive && "transition-colors duration-120 hover:border-line-2",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 min-h-11 px-4 py-2.5 border-b border-line",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn("flex items-center gap-1.5 text-body font-semibold text-ink [&>svg]:w-4 [&>svg]:h-4 [&>svg]:text-ink-2", className)}
      {...props}
    />
  );
}

const PADDINGS = {
  none: "",
  sm: "px-4 py-3",
  md: "p-4",
} as const;

type CardBodyProps = ComponentProps<"div"> & { padding?: keyof typeof PADDINGS };

export function CardBody({ className, padding = "md", ...props }: CardBodyProps) {
  return <div className={cn(PADDINGS[padding], className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center justify-between gap-3 px-4 py-2.5 border-t border-line", className)}
      {...props}
    />
  );
}
