// Bloc rouge « recaps d'AG en retard ». Ce sont des recaps ABSENTS - a garder distinct
// de la file des recaps RECUS : on ne lit rien ici, on constate un trou.
//
// Deux variantes, parce que les deux profils n'ont pas le meme geste a faire :
//  - gestionnaire : il corrige sur place -> chaque ligne ouvre la saisie pre-remplie ;
//  - comptable    : il ne saisit pas -> chaque ligne ouvre la fiche copro (pour relancer).

import { AlertTriangle } from "lucide-react";
import { Rows, Row } from "@/components/ui/list-rows";
import { Badge } from "@/components/ui/badge";
import { Aide } from "@/components/ui/aide";
import { formatDateLongue } from "@/lib/format-date";
import { DELAI_RECAP_JOURS } from "@/lib/domain/recap-ag/retard";
import type { RecapEnRetard } from "@/lib/services/compta/recaps-en-retard";

type Variante = "gestionnaire" | "comptable";

const AIDE: Record<Variante, string> = {
  gestionnaire: `Le récap est attendu dans les ${DELAI_RECAP_JOURS} jours qui suivent l'assemblée. Ces AG l'attendent encore : la comptabilité ne peut rien saisir tant qu'il manque.`,
  comptable: `Aucun récap reçu plus de ${DELAI_RECAP_JOURS} jours après l'AG. Rien à traiter ici : c'est le gestionnaire qu'il faut relancer.`,
};

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
    <section aria-labelledby="recaps-en-retard" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4 min-h-7">
        <h2 id="recaps-en-retard" className="flex items-center gap-2 text-title font-semibold tracking-tight text-err-700">
          <AlertTriangle strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden />
          Récaps d&apos;AG en retard
          <span className="text-body font-normal tabular-nums">{lignes.length}</span>
        </h2>
        <Aide titre="Pourquoi c'est rouge">{AIDE[variante]}</Aide>
      </div>
      <Rows>
        {lignes.map((r) => {
          const href =
            variante === "gestionnaire"
              ? `/recap-ag?copro=${encodeURIComponent(r.coproCode)}#saisie-recap`
              : `/copropriete/${encodeURIComponent(r.coproCode)}`;
          return (
            <Row
              key={r.coproCode}
              href={href}
              ton="err"
              avant={r.coproCode}
              principal={r.coproNom}
              secondaire={
                <>
                  AG du {formatDateLongue(r.agDate)}
                  {r.datePrevisionnelle && (
                    // On ne masque pas ces lignes : le referentiel porte des dates de
                    // remplissage (une meme date posee en masse) qui ne correspondent a
                    // aucune AG reelle. Seul le gestionnaire peut trancher.
                    <span className="text-ink-2"> · date prévisionnelle jamais conclue : saisir le récap ou corriger la date sur la fiche</span>
                  )}
                </>
              }
              droite={
                <Badge ton="err" dot>
                  {r.joursDeRetard} j de retard
                </Badge>
              }
            />
          );
        })}
      </Rows>
    </section>
  );
}
