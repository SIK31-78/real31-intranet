import Link from "next/link";
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
    "flex items-center gap-1 rounded-sm border transition-colors duration-75",
    small ? "h-[18px] px-1 text-[11px]" : "h-6 px-1.5 text-[12px] gap-1.5",
    TYPE_STYLE[type],
    STATUT_STYLE[statut],
    // Date pas encore confirmee par le CS : bordure pointillee, sobre.
    confirmation === "a_confirmer" && "border-dashed",
    "cursor-pointer hover:brightness-[0.97]",
    className,
  );
  const titre = `${type}${mentionConf ? ` ${mentionConf}` : ""} · ${coproNomCourt} · ${coproCode}${heure ? ` · ${heure}` : ""}`;
  const contenu = (
    <>
      <span className="font-semibold tracking-tight shrink-0">{type}</span>
      {mentionConf && (
        <span className={cn("shrink-0 italic opacity-80", small ? "text-[10px]" : "text-[11px]")}>
          {mentionConf}
        </span>
      )}
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
    </>
  );

  return (
    <Link href={href} title={titre} className={classes}>
      {contenu}
    </Link>
  );
}
