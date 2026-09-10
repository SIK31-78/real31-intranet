// Frise visuelle des etapes d'un parcours AG (Dates -> ODJ -> Convoc -> Tenue -> PV).
// Partagee par la fiche copro et la supervision. Composant de presentation pur.
// Lecture : l'etape EN COURS est la seule en noir + medium, avec un anneau vert ;
// les etapes faites sont cochees, les etapes a venir sont en tertiaire.

import { Fragment } from "react";
import { Check } from "lucide-react";
import type { EtapeParcours, StatutEtape } from "@/lib/domain/dashboard";

export function FriseEtapes({ etapes }: { etapes: EtapeParcours[] }) {
  return (
    <ol className="flex items-center">
      {etapes.map((e, i) => (
        <Fragment key={e.code}>
          <li className="flex items-center gap-2 shrink-0" aria-current={e.statut === "encours" ? "step" : undefined}>
            <Pastille statut={e.statut} numero={i + 1} />
            <span className={`text-body ${LABEL_STYLE[e.statut]}`}>{e.label}</span>
          </li>
          {i < etapes.length - 1 && (
            <span
              className={`flex-1 h-px mx-3 min-w-3 ${e.statut === "fait" ? "bg-green-700/40" : "bg-line"}`}
              aria-hidden
            />
          )}
        </Fragment>
      ))}
    </ol>
  );
}

const LABEL_STYLE: Record<StatutEtape, string> = {
  fait: "text-ink-2",
  encours: "text-ink font-medium",
  avenir: "text-ink-3",
};

function Pastille({ statut, numero }: { statut: StatutEtape; numero: number }) {
  const base = "w-5 h-5 rounded-full flex items-center justify-center text-meta font-semibold tabular-nums shrink-0";
  if (statut === "fait") {
    return (
      <span className={`${base} bg-green-700 text-white`} aria-label="étape faite">
        <Check strokeWidth={2.5} className="w-3 h-3" />
      </span>
    );
  }
  if (statut === "encours") {
    return (
      <span
        className={`${base} bg-surface border-2 border-green-700 text-green-700 animate-scale-in`}
        aria-label="étape en cours"
      >
        {numero}
      </span>
    );
  }
  return (
    <span className={`${base} bg-surface-2 border border-line text-ink-3`} aria-label="étape à venir">
      {numero}
    </span>
  );
}
