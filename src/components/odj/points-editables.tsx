"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { PointLegal } from "@/lib/domain/odj";

/** Un point reglementaire applicable, retirable (bouton VISIBLE, pas seulement au
 *  survol : "on peut pas les enlever" - retour Sekou 2026-08-31). */
export function PointEditable({
  point,
  onToggle,
}: {
  point: PointLegal;
  onToggle: (pointId: string, retire: boolean) => Promise<void>;
}) {
  const [enCours, setEnCours] = useState(false);
  return (
    <div className={`group/point relative pr-8 ${enCours ? "opacity-50" : ""}`}>
      <p className="text-[12px] font-semibold text-ink">{point.titre}</p>
      <p className="text-[11.5px] text-ink-2 leading-[1.5]">{point.texte}</p>
      <button
        type="button"
        title="Retirer ce point de l'ordre du jour"
        disabled={enCours}
        onClick={() => {
          setEnCours(true);
          void onToggle(point.id, true).finally(() => setEnCours(false));
        }}
        className="absolute right-0 top-0.5 p-1 rounded text-ink-3 hover:text-warn-700 hover:bg-warn-50 group-hover/point:text-ink-3 transition-colors"
      >
        <EyeOff strokeWidth={1.5} className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Les points retires, reintegrables d'un clic. */
export function PointsRetires({
  points,
  onToggle,
}: {
  points: PointLegal[];
  onToggle: (pointId: string, retire: boolean) => Promise<void>;
}) {
  const [enCours, setEnCours] = useState<string | null>(null);
  if (points.length === 0) return null;
  return (
    <div className="mt-4 pt-3 border-t border-dashed border-line">
      <p className="text-[11px] text-ink-3 mb-1.5">Points retirés de ce document ({points.length}) :</p>
      <ul className="space-y-1">
        {points.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <button
              type="button"
              disabled={enCours === p.id}
              onClick={() => {
                setEnCours(p.id);
                void onToggle(p.id, false).finally(() => setEnCours(null));
              }}
              title={p.condition ? `Réintégrer - ${p.condition}` : "Réintégrer ce point"}
              className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-2 hover:text-green-700 disabled:opacity-50"
            >
              <Eye strokeWidth={1.5} className="w-3 h-3 shrink-0" />
              <span className="line-through decoration-line-2">{p.titre}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

