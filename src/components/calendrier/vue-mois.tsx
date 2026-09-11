import { cn } from "@/lib/cn";
import { JOURS_COURT, type MoisGrille } from "@/lib/domain/calendrier-grille";
import { indexerParDate, type Evenement } from "@/lib/domain/calendrier";
import { libelleJourOccupe, type JourOccupe } from "@/lib/domain/agenda-occupe";
import { EvenementChip } from "./evenement-chip";

const MAX_VISIBLES = 3;

export function VueMois({
  grille,
  evenements,
  occupe,
}: {
  grille: MoisGrille;
  evenements: Evenement[];
  /** Agenda Outlook du gestionnaire, par jour. Vide = case decochee ou rien a montrer. */
  occupe?: Map<string, JourOccupe>;
}) {
  const index = indexerParDate(evenements);
  return (
    <div className="bg-surface border border-line rounded-lg shadow-1 overflow-hidden">
      {/* 7 colonnes de jours : ca n'a pas de sens en 1 colonne sur mobile, on garde
          la grille et on la rend scrollable horizontalement plutot que de l'ecraser. */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 border-b border-line bg-surface-2/40">
            {JOURS_COURT.map((j) => (
              <div
                key={j}
                className="px-2 py-1.5 text-meta font-medium uppercase tracking-[0.06em] text-ink-3 border-r border-line last:border-r-0"
              >
                {j}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grille.semaines.flatMap((s, si) =>
              s.jours.map((j, ji) => {
                const evs = index.get(j.date) ?? [];
                const pris = occupe?.get(j.date);
                const visibles = evs.slice(0, MAX_VISIBLES);
                const reste = evs.length - visibles.length;
                const dernierLigne = si === grille.semaines.length - 1;
                return (
                  <div
                    key={`${si}-${ji}`}
                    className={cn(
                      "min-h-[96px] p-1 flex flex-col gap-0.5 border-r border-b border-line last:border-r-0",
                      ji === 6 && "border-r-0",
                      dernierLigne && "border-b-0",
                      j.horsMois && "bg-surface-2/30",
                    )}
                  >
                    <div className="flex items-center justify-end mb-0.5">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center min-w-5 h-5 px-1 text-body",
                          j.horsMois && "text-ink-3",
                          !j.horsMois && !j.estAujourdhui && "text-ink-2",
                          j.estAujourdhui &&
                            "bg-ink text-white rounded-full font-medium",
                        )}
                      >
                        {j.numero}
                      </span>
                    </div>
                    {visibles.map((e) => (
                      <EvenementChip key={e.id} evenement={e} taille="sm" />
                    ))}
                    {reste > 0 && (
                      <span className="text-meta text-ink-3 pl-1">
                        +{reste} autre{reste > 1 ? "s" : ""}
                      </span>
                    )}
                    {/* Agenda Outlook : SOUS les AG/CS et en gris. C'est du contexte pour
                        savoir ou poser une reunion, pas un evenement du parcours - il ne
                        doit jamais concurrencer une AG a l'oeil. `mt-auto` le colle en bas
                        de la case pour que les chips restent alignes d'un jour a l'autre. */}
                    {pris && (
                      <span
                        className="mt-auto pl-1 text-meta text-ink-3 truncate"
                        title={
                          pris.journeeEntiere
                            ? "Journée prise dans votre agenda Outlook"
                            : `Occupé : ${pris.creneaux.map((c) => `${c.debut}–${c.fin}`).join(", ")}`
                        }
                      >
                        {libelleJourOccupe(pris)}
                      </span>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
