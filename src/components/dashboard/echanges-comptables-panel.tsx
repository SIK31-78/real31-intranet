import Link from "next/link";
import { Calculator, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateLongue } from "@/lib/format-date";
import type { EchangeComptable } from "@/lib/services/accueil/get-accueil-complement";

// Remontee accueil "Echanges comptables" : les copros du gestionnaire ou la comptable a
// laisse une note NON RESOLUE. Chaque ligne renvoie a la fiche (bloc "Preparation
// comptable"), ou le gestionnaire repond. Rendu uniquement si la liste est non vide.
export function EchangesComptablesPanel({ echanges }: { echanges: EchangeComptable[] }) {
  return (
    <Card>
      <ul className="divide-y divide-line">
        {echanges.map((e) => (
          <li key={`${e.coproCode}-${e.agDate}`}>
            <Link
              href={`/copropriete/${e.coproCode}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"
            >
              <Calculator strokeWidth={1.5} className="w-4 h-4 text-ink-3 shrink-0" />
              <span className="font-mono text-[12px] text-ink-2 w-[44px] shrink-0">{e.coproCode}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink truncate">{e.coproNom}</p>
                <p className="text-[12px] text-ink-3">AG du {formatDateLongue(e.agDate)}</p>
              </div>
              <Badge ton="warn" dot>
                {e.nbNotes} note{e.nbNotes > 1 ? "s" : ""} à traiter
              </Badge>
              <ArrowRight strokeWidth={1.5} className="w-4 h-4 text-ink-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
