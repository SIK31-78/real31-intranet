import { cn } from "@/lib/cn";
import { JalonPill } from "@/components/ui/jalon-pill";
import type { Evenement, TypeEvenement, StatutEvenement } from "@/lib/domain/calendrier";

// Couleur portee par le type d'evenement (brand pour AG, ambre pour AGE, bleu pour CS).
const TYPE_STYLE: Record<TypeEvenement, string> = {
  AG: "bg-green-50 text-green-700 border-green-100",
  AGE: "bg-warn-50 text-warn-700 border-[#f0dcae]",
  CS: "bg-info-50 text-info-700 border-[#c7d6ea]",
};

const STATUT_STYLE: Record<StatutEvenement, string> = {
  planifiee: "",
  convoquee: "",
  tenue: "opacity-60",
  annulee: "opacity-50 line-through",
};

type EvenementChipProps = {
  evenement: Evenement;
  /** sm = vue mois (1 ligne dense), md = vue semaine ou agenda. */
  taille?: "sm" | "md";
  className?: string;
};

export function EvenementChip({ evenement, taille = "md", className }: EvenementChipProps) {
  const { id, type, statut, coproNomCourt, coproCode, heure, jalon } = evenement;
  const small = taille === "sm";
  // Les AG/AGE pointent vers leur fiche de supervision. CS pas de cible pour l'instant.
  const href = type === "AG" || type === "AGE" ? `/supervision-ag/${id}` : "#";
  return (
    <a
      href={href}
      title={`${type} · ${coproNomCourt} · ${coproCode}${heure ? ` · ${heure}` : ""}`}
      className={cn(
        "flex items-center gap-1 rounded-sm border transition-colors duration-75",
        small ? "h-[18px] px-1 text-[11px]" : "h-6 px-1.5 text-[12px] gap-1.5",
        TYPE_STYLE[type],
        STATUT_STYLE[statut],
        className,
      )}
    >
      <span className="font-semibold tracking-tight shrink-0">{type}</span>
      <span className="truncate flex-1 min-w-0">{coproNomCourt}</span>
      {!small && (heure || jalon) && (
        <span className="flex items-center gap-1.5 shrink-0">
          {heure && <span className="font-mono text-[11px] opacity-70">{heure}</span>}
          {jalon && (
            <JalonPill
              label={jalon.label}
              severite={jalon.severite}
              className="h-[18px] min-w-[34px] text-[10.5px]"
            />
          )}
        </span>
      )}
    </a>
  );
}
