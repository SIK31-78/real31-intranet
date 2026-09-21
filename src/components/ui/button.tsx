import type { ComponentProps } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

// Bouton du design system. UNE SEULE action `primary` par ecran : elle vient du cycle
// AG (actionDuMoment / actionPrincipaleEcran), jamais d'un filtre ni d'un toggle.
// Un lien qui ressemble a un bouton = `ButtonLink` (meme rendu), jamais un <a> stylé
// a la main. Props explicites : pas de `className` de surcharge conflictuelle
// (cn() ne merge pas), seulement du placement (marge, largeur).

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-green-700 text-white border-transparent hover:bg-green-800 active:translate-y-px",
  secondary: "bg-surface text-ink border-line hover:bg-surface-2 hover:border-line-2",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface text-err-700 border-line hover:bg-err-50 hover:border-err-500/40",
  destructive: "bg-err-500 text-white border-transparent hover:bg-err-700 active:translate-y-px",
};

// 28 / 32 / 36 px : trois hauteurs, alignees sur les inputs (32) et les lignes (36).
const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 rounded-sm",
  md: "h-8 px-3 rounded-md",
  lg: "h-9 px-4 rounded-md",
};

const SIZES_ICON_ONLY: Record<ButtonSize, string> = {
  sm: "h-7 w-7 rounded-sm",
  md: "h-8 w-8 rounded-md",
  lg: "h-9 w-9 rounded-md",
};

const BASE =
  "inline-flex items-center justify-center gap-1.5 text-body font-medium leading-none border cursor-pointer whitespace-nowrap " +
  "transition-colors duration-120 ease-out-quart [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:shrink-0 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1 " +
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none";

type Communs = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Bouton carre ne contenant qu'une icone : `aria-label` obligatoire. */
  iconOnly?: boolean;
};

/** Les classes d'un bouton, pour un element qui n'en est pas un (un <label> de champ fichier). */
export function classesBouton(communs: Communs, className?: string): string {
  return classes(communs, className);
}

function classes({ variant = "secondary", size = "md", iconOnly = false }: Communs, className?: string) {
  return cn(BASE, VARIANTS[variant], iconOnly ? SIZES_ICON_ONLY[size] : SIZES[size], className);
}

type ButtonProps = ComponentProps<"button"> &
  Communs & {
    /** Action en cours : spinner a la place de l'icone, bouton inerte. */
    loading?: boolean;
  };

export function Button({
  variant,
  size,
  iconOnly,
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={classes({ variant, size, iconOnly }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & Communs;

/** Lien rendu comme un bouton (navigation interne). Meme API visuelle que `Button`. */
export function ButtonLink({ variant, size, iconOnly, className, ...props }: ButtonLinkProps) {
  return <Link className={classes({ variant, size, iconOnly }, className)} {...props} />;
}

type ButtonAnchorProps = ComponentProps<"a"> & Communs;

/** Lien externe rendu comme un bouton (nouvel onglet, app externe). */
export function ButtonAnchor({ variant, size, iconOnly, className, ...props }: ButtonAnchorProps) {
  return <a className={classes({ variant, size, iconOnly }, className)} {...props} />;
}
