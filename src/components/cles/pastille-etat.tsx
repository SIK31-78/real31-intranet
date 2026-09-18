import { Badge } from "@/components/ui/badge";
import { LIBELLE_ETAT, TON_ETAT, type EtatTrousseau } from "@/lib/domain/cles/types";

// La pastille d'etat d'un trousseau : un seul rendu partout (liste, fiche, recherche).
export function PastilleEtat({ etat, detail, size = "sm" }: { etat: EtatTrousseau; detail?: string; size?: "sm" | "md" }) {
  return (
    <Badge ton={TON_ETAT[etat]} size={size} dot>
      {LIBELLE_ETAT[etat]}
      {detail ? ` · ${detail}` : ""}
    </Badge>
  );
}

/** Le detail court a afficher a cote de l'etat : « chez CTH depuis 3 j », « retour prévu demain ». */
export function detailEtat(input: { etat: EtatTrousseau; entrepriseNom?: string; joursDehors: number; joursRetard: number; type?: "entreprise" | "interne"; contactNom?: string }): string | undefined {
  const qui = input.type === "interne" ? (input.contactNom ? `en interne (${input.contactNom})` : "en interne") : input.entrepriseNom ? `chez ${input.entrepriseNom}` : undefined;
  if (input.etat === "en_retard") return `${qui ? `${qui}, ` : ""}${input.joursRetard} j de retard`;
  if (input.etat === "sorti") return `${qui ? `${qui}, ` : ""}${input.joursDehors <= 0 ? "aujourd'hui" : `depuis ${input.joursDehors} j`}`;
  return undefined;
}
