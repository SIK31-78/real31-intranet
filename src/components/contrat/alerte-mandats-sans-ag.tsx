// Bloc « mandats a renouveler sans AG planifiee ». Orange tant que le mandat court encore,
// rouge une fois qu'il est fini : le syndic gere alors sans mandat valide.
//
// Le geste attendu est de POSER UNE DATE D'AG, et ca se fait sur la fiche de la copro :
// chaque ligne y mene. Rien n'est affiche quand la liste est vide - pas de bloc vert.

import { AlertTriangle } from "lucide-react";
import { Rows, Row } from "@/components/ui/list-rows";
import { Badge } from "@/components/ui/badge";
import { Aide } from "@/components/ui/aide";
import { formatDateLongue } from "@/lib/format-date";
import { SEUIL_ALERTE_MANDAT_MOIS } from "@/lib/domain/contrat/alerte-mandat";
import type { MandatSansAg } from "@/lib/services/contrat/mandats-sans-ag";

export function AlerteMandatsSansAg({ lignes }: { lignes: MandatSansAg[] }) {
  if (lignes.length === 0) return null;
  const echus = lignes.filter((l) => l.alerte.niveau === "echu").length;
  const tonTitre = echus > 0 ? "text-err-700" : "text-warn-700";

  return (
    <section aria-labelledby="mandats-sans-ag" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4 min-h-7">
        <h2
          id="mandats-sans-ag"
          className={`flex items-center gap-2 text-title font-semibold tracking-tight ${tonTitre}`}
        >
          <AlertTriangle strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden />
          Mandats à renouveler sans AG planifiée
          <span className="text-body font-normal tabular-nums">{lignes.length}</span>
        </h2>
        <Aide titre="Pourquoi cette alerte">
          Le contrat de syndic se renouvelle en AG. À {SEUIL_ALERTE_MANDAT_MOIS} mois de la fin du
          mandat, sans date d&apos;AG posée, la convocation ne tiendra plus dans les délais. Poser
          la date sur la fiche fait sortir la copropriété d&apos;ici.
        </Aide>
      </div>
      <Rows>
        {lignes.map((l) => {
          const echu = l.alerte.niveau === "echu";
          return (
            <Row
              key={l.coproCode}
              href={`/copropriete/${encodeURIComponent(l.coproCode)}`}
              ton={echu ? "err" : "warn"}
              avant={l.coproCode}
              principal={l.coproNom}
              secondaire={
                <>
                  Mandat jusqu&apos;au {formatDateLongue(l.finMandatISO)}
                  {l.derniereAgConnueISO && (
                    <span className="text-ink-2">
                      {" "}· dernière AG connue le {formatDateLongue(l.derniereAgConnueISO)}, jamais glissée
                    </span>
                  )}
                </>
              }
              droite={
                echu ? (
                  <Badge ton="err" dot>
                    mandat fini depuis {-l.alerte.joursAvantFin} j
                  </Badge>
                ) : (
                  <Badge ton="warn" dot>
                    fin dans {l.alerte.joursAvantFin} j
                  </Badge>
                )
              }
            />
          );
        })}
      </Rows>
    </section>
  );
}
