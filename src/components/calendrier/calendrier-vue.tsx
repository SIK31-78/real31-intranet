"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
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
import { Button } from "@/components/ui/button";

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
    return "Tous les événements";
  }, [vue, pivotMois, grilleSemaine]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {vue !== "liste" && (
            <div className="flex items-center gap-0.5">
              <Button
                onClick={navigatePrev}
                variant="secondary" size="sm" iconOnly className="w-7"
                aria-label="Période précédente"
              >
                <Icon name="chevron-left" className="w-4 h-4 text-ink-2" />
              </Button>
              <Button
                onClick={navigateToday}
                variant="secondary" size="sm"
              >
                Aujourd&apos;hui
              </Button>
              <Button
                onClick={navigateNext}
                variant="secondary" size="sm" iconOnly className="w-7"
                aria-label="Période suivante"
              >
                <Icon name="chevron-right" className="w-4 h-4 text-ink-2" />
              </Button>
            </div>
          )}
          <div className="text-title font-medium text-ink">{libellePeriode}</div>
        </div>
        <FiltresBar typesActifs={typesActifs} onToggleType={toggleType} />
        <SegmentedControl<VueType> label="Vue" value={vue} onChange={(v) => setVue(v ?? "mois")} options={VUES} />
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          {vue !== "liste" && evenementsFiltres.length === 0 && (
            <EmptyState compact>
              {typesActifs.length === 0 ? "Aucun type sélectionné" : "Aucun événement"}
            </EmptyState>
          )}
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
