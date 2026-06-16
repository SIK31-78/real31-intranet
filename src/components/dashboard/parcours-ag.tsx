// Parcours AG : la sequence Dates -> ODJ -> Convoc -> Tenue -> PV, une ligne par
// copro en cycle. But pedagogique : un junior voit l'ordre des operations ET ou en
// est chaque copro, avec un seul bouton "prochaine action". Composant de presentation
// (liens uniquement, pas d'etat) -> server component.

import Link from "next/link";
import { Fragment } from "react";
import { Check, ArrowRight, Route } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { EtapeParcours, LigneParcours, StatutEtape } from "@/lib/domain/dashboard";

export function ParcoursAg({ lignes }: { lignes: LigneParcours[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Route strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Préparer une AG, étape par étape
        </CardTitle>
        <span className="text-[12px] text-ink-3">Dates -&gt; ODJ -&gt; Convoc -&gt; Tenue -&gt; PV</span>
      </CardHeader>

      {lignes.length === 0 ? (
        <p className="px-4 py-8 text-[13px] text-ink-3 text-center">
          Aucune AG en préparation pour le moment. Les copropriétés apparaîtront ici
          dès qu&apos;une AG approche ou doit être planifiée.
        </p>
      ) : (
        <div>
          {lignes.map((l) => (
            <LigneVue key={l.id} ligne={l} />
          ))}
        </div>
      )}
    </Card>
  );
}

function LigneVue({ ligne }: { ligne: LigneParcours }) {
  return (
    <div className="px-4 py-3.5 border-b border-line last:border-b-0">
      <div className="flex items-center gap-2 mb-2.5">
        <Link
          href={`/copropriete/${ligne.coproCode}`}
          className="font-mono text-[12px] text-ink-2 hover:text-green-700 shrink-0"
        >
          {ligne.coproCode}
        </Link>
        <span className="text-[13px] font-medium text-ink truncate">{ligne.coproNom}</span>
        {ligne.echeance && (
          <Badge
            ton={ligne.enRetard ? "err" : ligne.echeance === "à dater" ? "warn" : "outline"}
            className="font-mono shrink-0"
            dot={Boolean(ligne.enRetard)}
          >
            {ligne.echeance}
          </Badge>
        )}
        <Link
          href={ligne.lien}
          className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-sm bg-green-700 text-surface text-[12px] font-medium hover:bg-green-600 transition-colors shrink-0"
        >
          {ligne.actionLabel}
          <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
        </Link>
      </div>

      <Frise etapes={ligne.etapes} />

      <p className="mt-2 text-[12px] text-ink-3">
        Prochaine action : <span className="text-ink-2">{ligne.prochaineAction}</span>
      </p>
    </div>
  );
}

function Frise({ etapes }: { etapes: EtapeParcours[] }) {
  return (
    <ol className="flex items-center">
      {etapes.map((e, i) => (
        <Fragment key={e.code}>
          <li className="flex items-center gap-1.5 shrink-0">
            <Pastille statut={e.statut} numero={i + 1} />
            <span className={`text-[11px] ${LABEL_STYLE[e.statut]}`}>{e.label}</span>
          </li>
          {i < etapes.length - 1 && (
            <span
              className={`flex-1 h-px mx-2 min-w-[12px] ${
                e.statut === "fait" ? "bg-green-700/40" : "bg-line"
              }`}
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
  encours: "text-green-700 font-medium",
  avenir: "text-ink-4",
};

function Pastille({ statut, numero }: { statut: StatutEtape; numero: number }) {
  const base = "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0";
  if (statut === "fait") {
    return (
      <span className={`${base} bg-green-700 text-surface`} aria-label="étape faite">
        <Check strokeWidth={2.5} className="w-3 h-3" />
      </span>
    );
  }
  if (statut === "encours") {
    return (
      <span
        className={`${base} bg-surface border-2 border-green-700 text-green-700`}
        aria-label="étape en cours"
      >
        {numero}
      </span>
    );
  }
  return (
    <span className={`${base} bg-surface-2 border border-line text-ink-4`} aria-label="étape à venir">
      {numero}
    </span>
  );
}
