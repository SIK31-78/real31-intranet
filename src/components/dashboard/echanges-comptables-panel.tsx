import { Rows, Row } from "@/components/ui/list-rows";
import { Badge } from "@/components/ui/badge";
import { formatDateLongue } from "@/lib/format-date";
import type { EchangeComptable } from "@/lib/services/accueil/get-accueil-complement";

// Remontee accueil "Echanges comptables" : les copros du gestionnaire ou la comptable a
// laisse une note NON RESOLUE. Chaque ligne renvoie a la fiche, ou le gestionnaire
// repond. Rendu uniquement si la liste est non vide (l'appelant conditionne).
export function EchangesComptablesPanel({ echanges }: { echanges: EchangeComptable[] }) {
  return (
    <Rows>
      {echanges.map((e) => (
        <Row
          key={`${e.coproCode}-${e.agDate}`}
          href={`/copropriete/${e.coproCode}`}
          avant={e.coproCode}
          principal={e.coproNom}
          secondaire={`AG du ${formatDateLongue(e.agDate)}`}
          droite={
            <Badge ton="warn" dot>
              {e.nbNotes} note{e.nbNotes > 1 ? "s" : ""} à traiter
            </Badge>
          }
        />
      ))}
    </Rows>
  );
}
