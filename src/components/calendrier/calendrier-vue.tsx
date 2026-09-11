"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Choix } from "@/components/ui/field";
import type { JourOccupe } from "@/lib/domain/agenda-occupe";
import { plagesOccupeesAction } from "@/app/calendrier/actions";
import { ecrirePreferenceAgenda } from "./preference-agenda";

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
  agendaOutlookParDefaut = false,
}: {
  evenements: Evenement[];
  aujourdhuiISO: string;
  /** Preference relue du cookie cote serveur : la case sort dans le bon etat. */
  agendaOutlookParDefaut?: boolean;
}) {
  const [vue, setVue] = useState<VueType>("mois");
  const [typesActifs, setTypesActifs] = useState<TypeEvenement[]>(TOUS_TYPES);
  const [pivotMois, setPivotMois] = useState(() => {
    const [y, m] = aujourdhuiISO.split("-").map(Number);
    return { annee: y, mois: m - 1 };
  });
  const [pivotSemaine, setPivotSemaine] = useState(aujourdhuiISO);
  // Agenda Outlook en fond (Sekou 2026-09-11, "une petite case afficher Outlook").
  // Decoche par defaut ET charge A LA DEMANDE : tant que personne ne coche, le calendrier
  // ne coute pas un appel Microsoft de plus.
  const [agendaOutlook, setAgendaOutlook] = useState(agendaOutlookParDefaut);
  const basculerAgenda = useCallback((actif: boolean) => {
    setAgendaOutlook(actif);
    ecrirePreferenceAgenda(actif);
  }, []);
  const [joursOccupes, setJoursOccupes] = useState<JourOccupe[]>([]);
  const [agendaEnCours, setAgendaEnCours] = useState(false);
  // Une periode deja chargee ne se redemande pas : naviguer d'un mois a l'autre et revenir
  // ferait sinon un aller-retour Graph a chaque fois.
  const cacheAgenda = useRef(new Map<string, JourOccupe[]>());

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

  // Periode couverte par la vue courante. La vue liste n'a pas de bornes : on n'y affiche
  // pas l'agenda (elle empile tous les evenements, sans notion de jour a l'ecran).
  const periode = useMemo(() => {
    if (vue === "mois") {
      const jours = grilleMois.semaines.flatMap((sem) => sem.jours.map((j) => j.date));
      return { du: jours[0]!, au: jours[jours.length - 1]! };
    }
    if (vue === "semaine") {
      const jours = grilleSemaine.jours.map((j) => j.date);
      return { du: jours[0]!, au: jours[jours.length - 1]! };
    }
    return null;
  }, [vue, grilleMois, grilleSemaine]);

  useEffect(() => {
    // Case decochee (ou vue liste) : on ne charge rien et on ne REMET RIEN A ZERO ici.
    // L'affichage est derive de `agendaOutlook` juste en dessous, donc un etat residuel
    // ne peut pas s'afficher - et on evite un setState en cascade a chaque rendu.
    if (!agendaOutlook || !periode) return;
    const cle = `${periode.du}|${periode.au}`;
    const deja = cacheAgenda.current.get(cle);
    if (deja) {
      setJoursOccupes(deja);
      return;
    }
    let annule = false;
    setAgendaEnCours(true);
    plagesOccupeesAction(periode.du, periode.au)
      .then((jours) => {
        cacheAgenda.current.set(cle, jours);
        if (!annule) setJoursOccupes(jours);
      })
      // Le service degrade deja en [] ; ce catch couvre l'echec de l'action elle-meme
      // (reseau coupe). L'agenda ne s'affiche pas, le calendrier AG/CS reste intact.
      .catch(() => {
        if (!annule) setJoursOccupes([]);
      })
      .finally(() => {
        if (!annule) setAgendaEnCours(false);
      });
    return () => {
      annule = true;
    };
  }, [agendaOutlook, periode]);

  // DERIVE de la case : decocher masque immediatement, sans attendre ni vider l'etat.
  const indexOccupe = useMemo(
    () => (agendaOutlook ? new Map(joursOccupes.map((j) => [j.date, j])) : new Map()),
    [agendaOutlook, joursOccupes],
  );

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
        <div className="flex items-center gap-4 flex-wrap">
          <FiltresBar typesActifs={typesActifs} onToggleType={toggleType} />
          {/* Free/busy seulement : ni sujet ni lieu ne remontent (choix Sekou pour la v1).
              Absente en vue liste, qui n'a pas de notion de jour a l'ecran. */}
          {vue !== "liste" && (
            <Choix
              type="checkbox"
              label={
                <span className="text-ink-2">
                  Afficher mon agenda Outlook
                  {agendaEnCours && <span className="text-ink-3"> · lecture…</span>}
                </span>
              }
              checked={agendaOutlook}
              onChange={(e) => basculerAgenda(e.target.checked)}
            />
          )}
        </div>
        <SegmentedControl<VueType> label="Vue" value={vue} onChange={(v) => setVue(v ?? "mois")} options={VUES} />
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          {vue !== "liste" && evenementsFiltres.length === 0 && indexOccupe.size === 0 && (
            <EmptyState compact>
              {typesActifs.length === 0 ? "Aucun type sélectionné" : "Aucun événement"}
            </EmptyState>
          )}
          {vue === "mois" && (
            <VueMois grille={grilleMois} evenements={evenementsFiltres} occupe={indexOccupe} />
          )}
          {vue === "semaine" && (
            <VueSemaine grille={grilleSemaine} evenements={evenementsFiltres} occupe={indexOccupe} />
          )}
          {vue === "liste" && <VueListe evenements={evenementsFiltres} />}
        </div>
        <AgendaProchains evenements={evenementsFiltres} aujourdhuiISO={aujourdhuiISO} />
      </div>
    </div>
  );
}
