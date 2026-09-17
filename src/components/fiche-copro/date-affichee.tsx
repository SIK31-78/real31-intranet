"use client";

import { Pencil } from "lucide-react";
import { formatDateLongue, formatHeure } from "@/lib/format-date";
import type { ModeReunion } from "@/lib/domain/confirmation-evenement";
import { MODE_LABEL, type Collaborateur } from "./editeur-date.utils";

// La date HORS edition : le bouton-date (clic -> selecteur inline), le badge du mode,
// puis la salle / ZOE et les collegues reserves, affiches discretement.
export function DateAffichee({
  dateISO,
  heure,
  avecHeure,
  labelVide,
  salleNom,
  zoeReservee,
  modeNom,
  collabs,
  onOuvrir,
}: {
  dateISO?: string;
  heure?: string;
  avecHeure: boolean;
  labelVide: string;
  salleNom: string | undefined;
  zoeReservee: boolean;
  modeNom: ModeReunion | undefined;
  collabs: Collaborateur[];
  onOuvrir: () => void;
}) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onOuvrir}
          className="inline-flex items-center gap-1.5 text-title font-medium text-ink hover:text-green-700 transition-colors duration-120 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          title="Modifier la date"
        >
          {dateISO ? (
            <span>
              {formatDateLongue(dateISO)}
              {avecHeure && heure && <span className="text-ink-2"> à {formatHeure(heure)}</span>}
            </span>
          ) : (
            <span className="text-ink-3 font-normal">{labelVide}</span>
          )}
          <Pencil strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-2" aria-hidden />
        </button>
        {/* Mode de tenue : badge discret a cote de la date. */}
        {dateISO && modeNom && (
          <span className="inline-flex items-center h-5 px-1.5 rounded-sm bg-surface-2 border border-line text-ink-2 text-meta font-medium">
            {MODE_LABEL[modeNom]}
          </span>
        )}
      </span>
      {dateISO && (salleNom || zoeReservee) && (
        <span className="text-body text-ink-2">
          {salleNom && <>salle {salleNom}</>}
          {salleNom && zoeReservee && <> · </>}
          {zoeReservee && <>voiture ZOE</>}
        </span>
      )}
      {/* Collegues associes : prenoms/noms discrets a cote de la date. */}
      {dateISO && collabs.length > 0 && (
        <span className="text-body text-ink-2">avec {collabs.map((c) => c.nom).join(", ")}</span>
      )}
    </span>
  );
}
