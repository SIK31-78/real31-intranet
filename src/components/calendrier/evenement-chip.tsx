import Link from "next/link";
import { cn } from "@/lib/cn";
import { Badge, tonDeSeverite } from "@/components/ui/badge";
import type { Evenement, TypeEvenement, StatutEvenement } from "@/lib/domain/calendrier";

// La couleur porte la CONFIRMATION par le conseil syndical, pas le type (Sekou
// 2026-09-10) : une date proposee est OCRE tant que le conseil ne l'a pas validee,
// elle passe au vert une fois confirmee. Une date sans statut de confirmation (AG
// passee, evenement non soumis au conseil) garde une couleur neutre par type.
const TYPE_STYLE: Record<TypeEvenement, string> = {
  AG: "bg-surface-2 text-ink-2 border-line",
  AGE: "bg-surface-2 text-ink-2 border-line",
  CS: "bg-info-50 text-info-700 border-info-500/30",
};

const CONFIRMATION_STYLE = {
  a_confirmer: "bg-warn-50 text-warn-700 border-warn-500/40",
  confirme: "bg-ok-50 text-ok-700 border-ok-500/40",
} as const;

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
  const { id, type, statut, coproNomCourt, coproCode, heure, jalon, confirmation } = evenement;
  const small = taille === "sm";
  // Confirmation par le conseil syndical (prochaines AG/CS) : le libelle devient
  // "AG a confirmer" / "AG confirmee" (demande patron). CS est masculin.
  const mentionConf =
    confirmation === "a_confirmer"
      ? "à confirmer"
      : confirmation === "confirme"
        ? type === "CS"
          ? "confirmé"
          : "confirmée"
        : undefined;
  // TOUTE vignette est cliquable (demande Sekou 2026-07-28) : AG/AGE -> la supervision
  // (fil d'AG) ; CS -> la fiche copro, ancre #dates-ag (le lieu ou vivent les dates CS).
  const href = type === "CS" ? `/copropriete/${coproCode}#dates-ag` : `/supervision-ag/${id}`;
  const classes = cn(
    "flex items-center gap-1 rounded-sm border transition-colors duration-120",
    small ? "h-5 px-1 text-meta" : "h-6 px-1.5 text-body gap-1.5",
    // La confirmation prime sur le type : ocre a confirmer, vert confirme.
    confirmation === "a_confirmer" || confirmation === "confirme"
      ? CONFIRMATION_STYLE[confirmation]
      : TYPE_STYLE[type],
    STATUT_STYLE[statut],
    // Date pas encore confirmee par le CS : bordure pointillee en plus de l'ocre.
    confirmation === "a_confirmer" && "border-dashed",
    "cursor-pointer hover:brightness-[0.97]",
    className,
  );
  const titre = `${type}${mentionConf ? ` ${mentionConf}` : ""} · ${coproNomCourt} · ${coproCode}${heure ? ` · ${heure}` : ""}`;
  const contenu = (
    <>
      <span className="font-semibold tracking-tight shrink-0">{type}</span>
      {mentionConf && (
        <span className={cn("shrink-0 italic opacity-80", "text-meta")}>
          {mentionConf}
        </span>
      )}
      <span className="truncate flex-1 min-w-0">{coproNomCourt}</span>
      {!small && (heure || jalon) && (
        <span className="flex items-center gap-1.5 shrink-0">
          {heure && <span className="text-meta tabular-nums opacity-70">{heure}</span>}
          {jalon && (
            <Badge ton={tonDeSeverite(jalon.severite)}>{jalon.label}</Badge>
          )}
        </span>
      )}
    </>
  );

  return (
    <Link href={href} title={titre} className={classes}>
      {contenu}
    </Link>
  );
}
