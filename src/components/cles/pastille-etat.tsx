import { Badge } from "@/components/ui/badge";
import { LIBELLE_ETAT, TON_ETAT, type EtatTrousseau } from "@/lib/domain/cles/types";

// La pastille d'etat d'un trousseau : un seul rendu partout (liste, fiche, recherche).
// Le detail reste court (« 12 j », « 19 septembre ») ; le reste se lit dans la ligne.
export function PastilleEtat({ etat, detail, size = "sm" }: { etat: EtatTrousseau; detail?: string; size?: "sm" | "md" }) {
  return (
    <Badge ton={TON_ETAT[etat]} size={size} dot>
      {LIBELLE_ETAT[etat]}
      {detail ? ` · ${detail}` : ""}
    </Badge>
  );
}
