"use client";

import type { ComponentProps } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { ModeReunion } from "@/lib/domain/confirmation-evenement";
import type { RessourceReunion } from "@/lib/domain/salles-reunion";
import { Button } from "@/components/ui/button";
import { Select, Choix } from "@/components/ui/field";
import { ColleguesAssocies } from "./collegues-associes";
import { MODES, type Dispo } from "./editeur-date.utils";

// LOGISTIQUE, REPLIEE PAR DEFAUT (Sekou, 2026-09-11 : "trop de choses affichees one shot").
// Une ligne de resume, depliable. Tout ce qui suit (mode, salle, ZOE, collegues, dispos)
// etait affiche en permanence : c'etait l'essentiel des 11 blocs que Sekou voyait "one
// shot" alors qu'il venait juste poser une date.
export function LogistiqueReunion({
  ouverte,
  onToggleOuverte,
  resume,
  pending,
  modeVal,
  onModeChange,
  salleVal,
  onSalleChange,
  sallesAffichees,
  sallesAutres,
  voirAutresSalles,
  onToggleVoirAutresSalles,
  zoeVal,
  onZoeChange,
  agendaCreneau,
  dispoCreneau,
  dispoZoeCreneau,
  dispoAgendaValeur,
  dispoValeur,
  dispoZoeValeur,
  avecCollegues,
  collegues,
}: {
  ouverte: boolean;
  onToggleOuverte: () => void;
  resume: string;
  pending: boolean;
  modeVal: ModeReunion | "";
  onModeChange: (v: ModeReunion | "") => void;
  salleVal: string;
  onSalleChange: (v: string) => void;
  sallesAffichees: RessourceReunion[];
  sallesAutres: RessourceReunion[];
  voirAutresSalles: boolean;
  onToggleVoirAutresSalles: () => void;
  zoeVal: boolean;
  onZoeChange: (v: boolean) => void;
  agendaCreneau: boolean;
  dispoCreneau: boolean;
  dispoZoeCreneau: boolean;
  dispoAgendaValeur: Dispo | null;
  dispoValeur: Dispo | null;
  dispoZoeValeur: Dispo | null;
  /** L'annuaire des collegues est charge (sinon la section n'apparait pas). */
  avecCollegues: boolean;
  collegues: ComponentProps<typeof ColleguesAssocies>;
}) {
  return (
    <span className="inline-flex flex-col gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        aria-expanded={ouverte}
        disabled={pending}
        onClick={onToggleOuverte}
      >
        {ouverte ? (
          <ChevronDown strokeWidth={1.5} />
        ) : (
          <ChevronRight strokeWidth={1.5} />
        )}
        {resume}
      </Button>

      {ouverte && (
        <span className="inline-flex flex-col gap-2 pl-3 border-l border-line">
          {/* Mode de tenue : visio / presentiel / hybride, ou "non precise". Pas de
              lien Teams genere pour l'instant ; la salle reste optionnelle en visio. */}
          <span className="inline-flex items-center gap-2 flex-wrap">
            <Select
              largeur="auto"
              value={modeVal}
              disabled={pending}
              aria-label="Mode de tenue de la réunion"
              onChange={(e) => onModeChange(e.target.value as ModeReunion | "")}
            >
              <option value="">Mode non précisé</option>
              {MODES.map((m) => (
                <option key={m.valeur} value={m.valeur}>
                  {m.label}
                </option>
              ))}
            </Select>
          </span>

          {/* Salle + ZOE. La room mailbox auto-accepte si le creneau est libre. */}
          <span className="inline-flex items-center gap-2 flex-wrap">
            <Select
              largeur="auto"
              value={salleVal}
              disabled={pending}
              aria-label="Salle de réunion à réserver"
              onChange={(e) => onSalleChange(e.target.value)}
            >
              <option value="">Aucune salle</option>
              {sallesAffichees.map((s) => (
                <option key={s.email} value={s.email}>
                  {s.nom}
                </option>
              ))}
            </Select>

            {/* Debordement : revele les salles des autres agences. */}
            {sallesAutres.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleVoirAutresSalles}
                aria-expanded={voirAutresSalles}
                disabled={pending}
              >
                {voirAutresSalles ? "Masquer les autres agences" : "Voir les autres agences"}
              </Button>
            )}

            <Choix
              type="checkbox"
              label="Réserver la voiture ZOE"
              checked={zoeVal}
              disabled={pending}
              onChange={(e) => onZoeChange(e.target.checked)}
            />
          </span>

          {/* Dispos du creneau. Seul le vert et le gris restent ICI : ce qui est OCCUPE
              remonte dans le bloc "A verifier" et n'est plus dit deux fois. */}
          {(agendaCreneau || dispoCreneau || dispoZoeCreneau) && (
            <span className="inline-flex items-center gap-3 flex-wrap text-body" aria-live="polite">
              {agendaCreneau && dispoAgendaValeur !== "occupee" && (
                <span className={dispoAgendaValeur === "libre" ? "text-ok-700" : "text-ink-2"}>
                  {dispoAgendaValeur === null
                    ? "Ton agenda : vérification…"
                    : dispoAgendaValeur === "libre"
                      ? "Ton agenda : libre"
                      : "Ton agenda : dispo inconnue"}
                </span>
              )}
              {dispoCreneau && dispoValeur !== "occupee" && (
                <span className={dispoValeur === "libre" ? "text-ok-700" : "text-ink-2"}>
                  {dispoValeur === null
                    ? "Salle : vérification…"
                    : dispoValeur === "libre"
                      ? "Salle libre"
                      : "Salle : dispo inconnue"}
                </span>
              )}
              {dispoZoeCreneau && (
                <span
                  className={
                    dispoZoeValeur === "libre"
                      ? "text-ok-700"
                      : dispoZoeValeur === "occupee"
                        ? "text-warn-700"
                        : "text-ink-2"
                  }
                >
                  {dispoZoeValeur === null
                    ? "ZOE : vérification…"
                    : dispoZoeValeur === "libre"
                      ? "ZOE libre"
                      : dispoZoeValeur === "occupee"
                        ? "ZOE occupée"
                        : "ZOE : dispo inconnue"}
                </span>
              )}
            </span>
          )}

          {avecCollegues && <ColleguesAssocies {...collegues} />}
        </span>
      )}
    </span>
  );
}
