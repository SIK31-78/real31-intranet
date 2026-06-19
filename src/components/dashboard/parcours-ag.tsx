// Parcours AG : la sequence Dates -> ODJ -> Convoc -> Tenue -> PV, une ligne par
// copro en cycle. But pedagogique : un junior voit l'ordre des operations ET ou en
// est chaque copro, avec un seul bouton "prochaine action".
// Client : filtre par cloture d'exercice comptable (les copros d'un meme exercice
// partagent la meme echeance legale d'AG) + plafond d'affichage.

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Route } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FriseEtapes } from "@/components/parcours/frise-etapes";
import type { LigneParcours } from "@/lib/domain/dashboard";

const MAX_AFFICHE = 12;

// Ordonne les clotures "JJ/MM" par mois puis jour (31/12 apres 30/06).
function rangCloture(c: string): number {
  const [jj, mm] = c.split("/").map(Number);
  return mm * 100 + jj;
}

export function ParcoursAg({ lignes }: { lignes: LigneParcours[] }) {
  const [cloture, setCloture] = useState<string>("");

  const clotures = useMemo(
    () =>
      Array.from(new Set(lignes.map((l) => l.exerciceCloture).filter((c): c is string => Boolean(c)))).sort(
        (a, b) => rangCloture(a) - rangCloture(b),
      ),
    [lignes],
  );

  const filtrees = cloture ? lignes.filter((l) => l.exerciceCloture === cloture) : lignes;
  const visibles = filtrees.slice(0, MAX_AFFICHE);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Route strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Préparer une AG, étape par étape
        </CardTitle>
        <div className="flex items-center gap-3">
          {clotures.length > 1 && (
            <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
              Exercice clos le
              <select
                value={cloture}
                onChange={(e) => setCloture(e.target.value)}
                className="h-7 rounded-sm border border-line bg-surface px-1.5 text-[12px] text-ink-2 hover:border-line-2"
              >
                <option value="">Tous</option>
                {clotures.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="text-[12px] text-ink-3 hidden sm:inline">Dates -&gt; ODJ -&gt; Convoc -&gt; Tenue -&gt; PV</span>
        </div>
      </CardHeader>

      {visibles.length === 0 ? (
        <p className="px-4 py-8 text-[13px] text-ink-3 text-center">
          {cloture
            ? `Aucune AG en préparation pour l'exercice clos le ${cloture}.`
            : "Aucune AG en préparation pour le moment. Les copropriétés apparaîtront ici dès qu'une AG approche ou doit être planifiée."}
        </p>
      ) : (
        <>
          <div>
            {visibles.map((l) => (
              <LigneVue key={l.id} ligne={l} />
            ))}
          </div>
          {filtrees.length > MAX_AFFICHE && (
            <p className="px-4 py-2.5 text-[12px] text-ink-3 border-t border-line">
              {filtrees.length - MAX_AFFICHE} autre(s) copropriété(s) en cycle non affichée(s).
            </p>
          )}
        </>
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
            ton={ligne.enRetard ? "err" : ligne.echeance.startsWith("J-") ? "outline" : "warn"}
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

      <FriseEtapes etapes={ligne.etapes} />

      <p className="mt-2 text-[12px] text-ink-3">
        Prochaine action : <span className="text-ink-2">{ligne.prochaineAction}</span>
      </p>
    </div>
  );
}
