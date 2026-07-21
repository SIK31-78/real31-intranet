"use client";

// Historique des recaps AG : ce qui a ete enregistre, avec le depassement
// facture le cas echeant.

import { Card } from "@/components/ui/card";
import { CheckCircle2, Receipt, TriangleAlert } from "lucide-react";

export interface RecapAffiche {
  id: string;
  coproCode: string;
  agDate: string;
  statut: "nouveau" | "a_facturer" | "termine" | "erreur";
  depassementHeures: number;
  depassementTtc: number;
  nbTravaux: number;
  factureId?: string;
  par?: string;
  /** Horodatage ISO de creation (affiche date + heure). */
  creeLe: string;
}

function jour(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}
/** Date + heure locale de creation. */
function quand(iso: string): string {
  const d = new Date(iso);
  const deuxChiffres = (n: number) => String(n).padStart(2, "0");
  return `${deuxChiffres(d.getDate())}/${deuxChiffres(d.getMonth() + 1)}/${d.getFullYear()} à ${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`;
}

function euros(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

function Statut({ statut }: { statut: RecapAffiche["statut"] }) {
  if (statut === "erreur") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-red-700">
        <TriangleAlert className="w-3.5 h-3.5" strokeWidth={1.5} /> Échec
      </span>
    );
  }
  if (statut === "a_facturer") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-amber-800">
        <Receipt className="w-3.5 h-3.5" strokeWidth={1.5} /> Facturé
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-green-800">
      <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Terminé
    </span>
  );
}

export function HistoriqueRecaps({ recaps }: { recaps: RecapAffiche[] }) {
  return (
    <Card>
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-[14px] font-semibold text-ink">
          Récaps enregistrés <span className="font-normal text-ink-3">({recaps.length})</span>
        </h2>
      </div>

      {recaps.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-ink-3">
          Aucun récap AG pour l&apos;instant.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {recaps.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] text-ink">
                  <span className="font-medium">{r.coproCode}</span>
                  <span className="text-ink-3"> · AG du {jour(r.agDate)}</span>
                </p>
                <p className="text-[12px] text-ink-3">
                  Saisi le {quand(r.creeLe)}
                  {r.par ? ` · ${r.par}` : ""}
                  {r.nbTravaux > 0 ? ` · ${r.nbTravaux} travaux votés` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {r.depassementHeures > 0 ? (
                  <span className="text-[13px] text-ink">
                    {r.depassementHeures} h · {euros(r.depassementTtc)} TTC
                  </span>
                ) : (
                  <span className="text-[12px] text-ink-3">Pas de dépassement</span>
                )}
                <Statut statut={r.statut} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
