"use client";

import type { ComponentProps } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { ModeReunion } from "@/lib/domain/confirmation-evenement";
import type { RessourceReunion } from "@/lib/domain/salles-reunion";
import { Button } from "@/components/ui/button";
import { Select, Choix, Input } from "@/components/ui/field";
import { LIEU_LIBRE_MAX } from "@/lib/domain/confirmation-evenement";

/** Valeur du selecteur de salle pour une reunion hors des locaux (REA-148). Jamais un
 *  email de salle : elle ne part pas au serveur comme salle, seulement comme lieu libre. */
const EXTERIEUR = "__exterieur__";
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
  exterieurVal,
  onExterieurChange,
  lieuLibreVal,
  onLieuLibreChange,
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
  /** Reunion « à l'extérieur du cabinet » : exclusive d'une salle REAL31. */
  exterieurVal: boolean;
  onExterieurChange: (v: boolean) => void;
  /** Adresse libre du lieu exterieur. */
  lieuLibreVal: string;
  onLieuLibreChange: (v: string) => void;
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
              value={exterieurVal ? EXTERIEUR : salleVal}
              disabled={pending}
              aria-label="Salle de réunion à réserver"
              onChange={(e) => {
                // « À l'extérieur » et une salle du cabinet s'excluent : choisir l'un vide l'autre.
                const v = e.target.value;
                onExterieurChange(v === EXTERIEUR);
                onSalleChange(v === EXTERIEUR ? "" : v);
              }}
            >
              <option value="">Aucune salle</option>
              {sallesAffichees.map((s) => (
                <option key={s.email} value={s.email}>
                  {s.nom}
                </option>
              ))}
              <option value={EXTERIEUR}>À l&apos;extérieur du cabinet</option>
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

          {/* Lieu exterieur (REA-148) : l'adresse libre, qui part dans l'invitation Outlook
              et que l'ordre du jour reprend comme lieu de la reunion. */}
          {exterieurVal && (
            <Input
              largeur="pleine"
              value={lieuLibreVal}
              disabled={pending}
              maxLength={LIEU_LIBRE_MAX}
              placeholder="Adresse du lieu (ex. salle des fêtes, 2 rue de la Mairie, 92250 La Garenne-Colombes)"
              aria-label="Adresse du lieu de la réunion à l'extérieur du cabinet"
              onChange={(e) => onLieuLibreChange(e.target.value)}
            />
          )}

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
