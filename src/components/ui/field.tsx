import { Children, cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// Champs de formulaire : label secondaire (ink-2), controle de 32 px, aide d'UNE
// ligne (`hint`), erreur sous le champ. Rendu serveur (aucun etat ici : le formulaire
// client garde son etat, ces composants ne font que dessiner).

// Largeur : pleine par defaut (formulaire), `auto` pour un filtre en ligne.
type Largeur = { largeur?: "pleine" | "auto" };
const LARGEUR: Record<NonNullable<Largeur["largeur"]>, string> = { pleine: "w-full", auto: "w-auto" };

const CONTROLE =
  "rounded-md border border-line bg-surface text-body text-ink placeholder:text-ink-3 " +
  "transition-colors duration-120 hover:border-line-2 " +
  "focus:outline-none focus:border-line-2 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1 " +
  "disabled:opacity-60 disabled:cursor-not-allowed aria-[invalid=true]:border-err-500";

export function Field({
  label,
  htmlFor,
  hint,
  erreur,
  requis = false,
  inline = false,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  /** Une ligne, pas plus. Ce qui est plus long va dans <Aide>. */
  hint?: ReactNode;
  erreur?: ReactNode;
  requis?: boolean;
  /** Label et controle sur la meme ligne (cases a cocher, petits champs). */
  inline?: boolean;
  children: ReactNode;
  className?: string;
}) {
  // L'erreur est reliee au controle (aria-describedby + aria-invalid) quand l'enfant est
  // un Input/Select/Textarea direct : le lecteur d'ecran lit l'erreur avec le champ.
  const erreurId = erreur && htmlFor ? `${htmlFor}-erreur` : undefined;
  const unique = Children.count(children) === 1 ? Children.only(children) : null;
  const controle =
    erreurId && isValidElement(unique) && (unique.type === Input || unique.type === Select || unique.type === Textarea)
      ? cloneElement(unique as ReactElement<Record<string, unknown>>, { "aria-invalid": true, "aria-describedby": erreurId })
      : children;
  return (
    <div className={cn("flex gap-1", inline ? "flex-row items-center gap-3" : "flex-col", className)}>
      <label htmlFor={htmlFor} className={cn("text-body text-ink-2", inline && "shrink-0")}>
        {label}
        {requis && <span className="text-err-700" aria-hidden> *</span>}
      </label>
      {controle}
      {hint && !erreur && <p className="text-meta text-ink-2">{hint}</p>}
      {erreur && <p id={erreurId} className="text-meta text-err-700" role="alert">{erreur}</p>}
    </div>
  );
}

export function Input({ largeur = "pleine", className, ...props }: ComponentProps<"input"> & Largeur) {
  return <input className={cn(CONTROLE, LARGEUR[largeur], "h-8 px-2.5", className)} {...props} />;
}

export function Select({ largeur = "pleine", className, ...props }: ComponentProps<"select"> & Largeur) {
  return <select className={cn(CONTROLE, LARGEUR[largeur], "h-8 pl-2.5 pr-8", className)} {...props} />;
}

export function Textarea({ largeur = "pleine", className, ...props }: ComponentProps<"textarea"> & Largeur) {
  return <textarea className={cn(CONTROLE, LARGEUR[largeur], "min-h-20 px-2.5 py-1.5 leading-5", className)} {...props} />;
}

/** Une option radio / case a cocher avec son libelle, alignee sur la ligne. */
export function Choix({
  label,
  className,
  ...props
}: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("inline-flex items-center gap-1.5 text-body text-ink cursor-pointer", className)}>
      <input className="accent-green-700 w-3.5 h-3.5" {...props} />
      {label}
    </label>
  );
}

/** Groupe d'options sur une ligne (Oui / Non, Forfait / Frais reels). */
export function GroupeChoix({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1 min-w-0">
      <legend className="text-body text-ink-2 mb-1">{label}</legend>
      <div className="flex items-center gap-4 h-8">{children}</div>
    </fieldset>
  );
}
