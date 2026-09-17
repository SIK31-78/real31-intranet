"use client";

import { AlertTriangle } from "lucide-react";
import { formatDateLongue } from "@/lib/format-date";
import type { AlerteDelaiAg } from "@/lib/domain/jalons-ag/alerte-delai";

export type PointAVerifier = { cle: string; texte: string; bloquant?: boolean };

// UN SEUL bloc "A verifier" : ce qui BLOQUE (salle occupee, convocation hors delai)
// contre ce qui se force apres accord, plus le retroplanning AG en repli.
export function PointsAVerifier({
  points,
  ton,
  delaiAg,
  blocageSalle,
  aAvertir,
}: {
  points: PointAVerifier[];
  ton: "err" | "warn";
  delaiAg: AlerteDelaiAg | null;
  blocageSalle: string | null;
  aAvertir: boolean;
}) {
  return (
    <span
      className={
        "inline-flex flex-col gap-1 rounded-lg border px-2.5 py-2 text-body " +
        (ton === "err"
          ? "border-err-500/30 bg-err-50 text-err-700"
          : "border-warn-500/30 bg-warn-50 text-warn-700")
      }
      role={ton === "err" ? "alert" : undefined}
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5 font-medium">
        <AlertTriangle strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" aria-hidden />
        À vérifier avant de fixer
      </span>
      {points.map((pt) => (
        <span key={pt.cle}>· {pt.texte}</span>
      ))}

      {/* Retroplanning : le detail des deux echeances, replie. */}
      {delaiAg && (
        <details className="text-ink-2">
          <summary className="cursor-pointer text-meta">Voir les échéances</summary>
          <span className="inline-flex flex-col gap-0.5 pt-1 text-meta">
            <span className={delaiAg.odjCsDepasse ? "text-warn-700" : undefined}>
              · ODJ à valider en CS avant le {formatDateLongue(delaiAg.odjCsISO)}
              {delaiAg.odjCsDepasse && " (échéance dépassée)"}
            </span>
            <span className={delaiAg.convocDepassee ? "text-warn-700" : undefined}>
              · Mise sous pli avant le {formatDateLongue(delaiAg.convocISO)}
              {delaiAg.convocDepassee && " (échéance dépassée)"}
            </span>
          </span>
        </details>
      )}

      <span className="text-ink-2 text-meta">
        {blocageSalle
          ? "Choisis une autre salle ou un autre créneau."
          : aAvertir
            ? "Après accord avec le(s) collègue(s), tu peux fixer quand même."
            : "Tu peux fixer cette date quand même."}
      </span>
    </span>
  );
}
