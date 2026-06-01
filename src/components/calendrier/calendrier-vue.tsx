"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import {
  libelleMois,
  libelleSemaine,
  moisGrille,
  moisVoisin,
  semaineGrille,
  semaineVoisine,
} from "@/lib/domain/calendrier-grille";
import type { Evenement, TypeEvenement } from "@/lib/domain/calendrier";
import { VueMois } from "./vue-mois";
import { VueSemaine } from "./vue-semaine";
import { VueListe } from "./vue-liste";
import { FiltresBar } from "./filtres-bar";
import { AgendaProchains } from "./agenda-prochains";

type VueType = "mois" | "semaine" | "liste";

const VUES: { value: VueType; label: string }[] = [
  { value: "mois", label: "Mois" },
  { value: "semaine", label: "Semaine" },
  { value: "liste", label: "Liste" },
];

const TOUS_TYPES: TypeEvenement[] = ["AG", "AGE", "CS"];

export function CalendrierVue({
  evenements,
  aujourdhuiISO,
}: {
  evenements: Evenement[];
  aujourdhuiISO: string;
}) {
  const [vue, setVue] = useState<VueType>("mois");
  const [typesActifs, setTypesActifs] = useState<TypeEvenement[]>(TOUS_TYPES);
  const [pivotMois, setPivotMois] = useState(() => {
    const [y, m] = aujourdhuiISO.split("-").map(Number);
    return { annee: y, mois: m - 1 };
  });
  const [pivotSemaine, setPivotSemaine] = useState(aujourdhuiISO);

  const evenementsFiltres = useMemo(
    () => evenements.filter((e) => typesActifs.includes(e.type)),
    [evenements, typesActifs],
  );

  const grilleMois = useMemo(
    () => moisGrille(pivotMois.annee, pivotMois.mois, aujourdhuiISO),
    [pivotMois, aujourdhuiISO],
  );
  const grilleSemaine = useMemo(
    () => semaineGrille(pivotSemaine, aujourdhuiISO),
    [pivotSemaine, aujourdhuiISO],
  );

  const toggleType = (t: TypeEvenement) =>
    setTypesActifs((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );

  const navigatePrev = () => {
    if (vue === "mois") setPivotMois(moisVoisin(pivotMois.annee, pivotMois.mois, -1));
    else if (vue === "semaine") setPivotSemaine(semaineVoisine(pivotSemaine, -1));
  };
  const navigateNext = () => {
    if (vue === "mois") setPivotMois(moisVoisin(pivotMois.annee, pivotMois.mois, 1));
    else if (vue === "semaine") setPivotSemaine(semaineVoisine(pivotSemaine, 1));
  };
  const navigateToday = () => {
    const [y, m] = aujourdhuiISO.split("-").map(Number);
    setPivotMois({ annee: y, mois: m - 1 });
    setPivotSemaine(aujourdhuiISO);
  };

  const libellePeriode = useMemo(() => {
    if (vue === "mois") return libelleMois(pivotMois.annee, pivotMois.mois);
    if (vue === "semaine") return libelleSemaine(grilleSemaine);
    return "Tous les evenements";
  }, [vue, pivotMois, grilleSemaine]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {vue !== "liste" && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={navigatePrev}
                className="h-7 w-7 inline-flex items-center justify-center rounded-sm border border-line bg-surface hover:border-line-2"
                aria-label="Periode precedente"
              >
                <Icon name="chevron-left" className="w-4 h-4 text-ink-2" />
              </button>
              <button
                type="button"
                onClick={navigateToday}
                className="h-7 px-2.5 rounded-sm border border-line bg-surface text-[12px] font-medium text-ink-2 hover:border-line-2"
              >
                Aujourd&apos;hui
              </button>
              <button
                type="button"
                onClick={navigateNext}
                className="h-7 w-7 inline-flex items-center justify-center rounded-sm border border-line bg-surface hover:border-line-2"
                aria-label="Periode suivante"
              >
                <Icon name="chevron-right" className="w-4 h-4 text-ink-2" />
              </button>
            </div>
          )}
          <div className="text-[15px] font-medium text-ink">{libellePeriode}</div>
        </div>
        <FiltresBar typesActifs={typesActifs} onToggleType={toggleType} />
        <div className="flex items-center gap-0.5 bg-surface-2 rounded-md p-0.5">
          {VUES.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setVue(v.value)}
              className={cn(
                "h-7 px-3 rounded-[5px] text-[12px] font-medium transition-colors duration-75",
                vue === v.value
                  ? "bg-surface text-ink shadow-1"
                  : "text-ink-3 hover:text-ink-2",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          {vue === "mois" && (
            <VueMois grille={grilleMois} evenements={evenementsFiltres} />
          )}
          {vue === "semaine" && (
            <VueSemaine grille={grilleSemaine} evenements={evenementsFiltres} />
          )}
          {vue === "liste" && <VueListe evenements={evenementsFiltres} />}
        </div>
        <AgendaProchains evenements={evenementsFiltres} aujourdhuiISO={aujourdhuiISO} />
      </div>
    </div>
  );
}
