import { cn } from "@/lib/cn";
import { JOURS_COURT, type SemaineGrille } from "@/lib/domain/calendrier-grille";
import { indexerParDate, type Evenement } from "@/lib/domain/calendrier";
import type { JourOccupe } from "@/lib/domain/agenda-occupe";
import { EvenementChip } from "./evenement-chip";

export function VueSemaine({
  grille,
  evenements,
  occupe,
}: {
  grille: SemaineGrille;
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
        <div className="grid min-w-[700px] grid-cols-7">
          {grille.jours.map((j, ji) => {
            const evs = index.get(j.date) ?? [];
            const pris = occupe?.get(j.date);
            const dernierCol = ji === 6;
            return (
              <div
                key={j.date}
                className={cn(
                  "min-h-[360px] flex flex-col border-r border-line",
                  dernierCol && "border-r-0",
                )}
              >
                <div
                  className={cn(
                    "px-2.5 py-2 border-b border-line flex items-baseline gap-1.5",
                    j.estAujourdhui && "bg-green-50",
                  )}
                >
                  <span
                    className={cn(
                      "text-meta font-medium uppercase tracking-[0.06em]",
                      j.estAujourdhui ? "text-green-700" : "text-ink-3",
                    )}
                  >
                    {JOURS_COURT[ji]}
                  </span>
                  <span
                    className={cn(
                      "text-title leading-none",
                      j.estAujourdhui ? "text-green-700 font-medium" : "text-ink",
                    )}
                  >
                    {j.numero}
                  </span>
                </div>
                <div className="p-2 flex flex-col gap-1.5 flex-1">
                  {evs.length === 0 && !pris && (
                    <span className="text-body text-ink-3 pl-1 pt-1">-</span>
                  )}
                  {evs.map((e) => (
                    <EvenementChip key={e.id} evenement={e} taille="md" />
                  ))}
                  {/* Agenda Outlook : la colonne est haute (360 px), on peut lister les
                      creneaux au lieu de les compter comme en vue mois. En gris, en bas :
                      c'est du contexte, jamais un evenement du parcours AG/CS. */}
                  {pris && (
                    <div className="mt-auto flex flex-col gap-0.5 pl-1 pt-1.5 border-t border-line">
                      <span className="text-meta uppercase tracking-[0.06em] text-ink-3">
                        Agenda
                      </span>
                      {pris.journeeEntiere ? (
                        <span className="text-meta text-ink-3">Journée prise</span>
                      ) : (
                        pris.creneaux.map((c) => (
                          <span key={`${c.debut}-${c.fin}`} className="text-meta text-ink-3 tabular-nums">
                            {c.debut}–{c.fin}
                          </span>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
