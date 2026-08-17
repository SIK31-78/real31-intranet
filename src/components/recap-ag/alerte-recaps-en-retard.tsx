// Bloc rouge « recaps d'AG en retard ». Ce sont des recaps ABSENTS - a garder distinct
// de la file des recaps RECUS : on ne lit rien ici, on constate un trou.
//
// Deux variantes, parce que les deux profils n'ont pas le meme geste a faire :
//  - gestionnaire : il corrige sur place -> chaque ligne ouvre la saisie pre-remplie ;
//  - comptable    : il ne saisit pas -> chaque ligne ouvre la fiche copro (pour relancer).

import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateLongue } from "@/lib/format-date";
import { DELAI_RECAP_JOURS } from "@/lib/domain/recap-ag/retard";
import type { RecapEnRetard } from "@/lib/services/compta/recaps-en-retard";

type Variante = "gestionnaire" | "comptable";

const AIDE: Record<Variante, string> = {
  gestionnaire: `Le récap est attendu dans les ${DELAI_RECAP_JOURS} jours qui suivent l'assemblée. Ces AG l'attendent encore : la comptabilité ne peut rien saisir tant qu'il manque.`,
  comptable: `Aucun récap reçu plus de ${DELAI_RECAP_JOURS} jours après l'AG. Rien à traiter ici : c'est le gestionnaire qu'il faut relancer.`,
};

function Ligne({ r, variante }: { r: RecapEnRetard; variante: Variante }) {
  const href =
    variante === "gestionnaire"
      ? `/recap-ag?copro=${encodeURIComponent(r.coproCode)}#saisie-recap`
      : `/copropriete/${encodeURIComponent(r.coproCode)}`;

  return (
    <li>
      <Link
        href={href}
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-err-50"
      >
        <span className="w-[44px] shrink-0 font-mono text-[12px] text-ink-2">{r.coproCode}</span>
        <div className="min-w-0 flex-1 basis-[200px]">
          <p className="truncate text-[13px] font-medium text-ink">{r.coproNom}</p>
          <p className="text-[12px] text-ink-3">AG du {formatDateLongue(r.agDate)}</p>
          {r.datePrevisionnelle && (
            // On ne masque pas ces lignes : le referentiel porte des dates de remplissage
            // (une meme date posee en masse) qui ne correspondent a aucune AG reelle. Seul
            // le gestionnaire peut trancher, donc on lui pose les deux branches.
            <p className="mt-0.5 text-[11.5px] text-ink-3">
              Date prévisionnelle jamais conclue — saisissez le récap, ou{" "}
              <span className="underline decoration-dotted">corrigez la date d&apos;AG</span> sur
              la fiche si l&apos;assemblée ne s&apos;est pas tenue ce jour-là.
            </p>
          )}
        </div>
        <Badge ton="err" dot>
          {r.joursDeRetard} j de retard
        </Badge>
        <ChevronRight strokeWidth={1.5} className="h-4 w-4 shrink-0 text-ink-4" />
      </Link>
    </li>
  );
}

export function AlerteRecapsEnRetard({
  lignes,
  variante,
}: {
  lignes: RecapEnRetard[];
  variante: Variante;
}) {
  // Rien en retard : on n'affiche pas un bloc vert de felicitations, on n'affiche rien.
  if (lignes.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-err-700">
          <AlertTriangle strokeWidth={1.5} className="h-4 w-4 shrink-0" />
          Récaps d&apos;AG en retard
          <span className="text-[12px] font-normal">({lignes.length})</span>
        </h2>
        <p className="mt-0.5 text-[12px] text-ink-3">{AIDE[variante]}</p>
      </div>
      <Card className="border-err-500/40 bg-err-50/50">
        <ul className="divide-y divide-err-500/20">
          {lignes.map((r) => (
            <Ligne key={r.coproCode} r={r} variante={variante} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
