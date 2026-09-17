"use client";

import { X, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { CollaborateurAssociable } from "./dates-actions";
import type { Collaborateur, Dispo } from "./editeur-date.utils";

// Collegues associes a la reunion : les RETENUS en pastilles, la liste a la demande.
// Douze cases a cocher permanentes etaient le plus gros bloc de l'editeur pour un
// reglage rare. Chaque collegue retenu est invite a l'evenement Outlook et sa dispo est
// verifiee sur le creneau.
export function ColleguesAssocies({
  collabRetenus,
  collabAffiches,
  collabAutres,
  collaborateursVal,
  agendaCreneau,
  dispoCollabValeur,
  onToggleCollaborateur,
  choixOuvert,
  onToggleChoix,
  voirAutres,
  onToggleVoirAutres,
  pending,
}: {
  collabRetenus: Collaborateur[];
  collabAffiches: CollaborateurAssociable[];
  collabAutres: CollaborateurAssociable[];
  collaborateursVal: string[];
  agendaCreneau: boolean;
  dispoCollabValeur: (email: string) => Dispo | undefined;
  onToggleCollaborateur: (email: string) => void;
  choixOuvert: boolean;
  onToggleChoix: () => void;
  voirAutres: boolean;
  onToggleVoirAutres: () => void;
  pending: boolean;
}) {
  return (
    <span className="inline-flex flex-col gap-1.5">
      <Eyebrow as="span">Collègues associés</Eyebrow>
      <span className="inline-flex items-center gap-1 flex-wrap">
        {collabRetenus.map((c) => {
          const d = agendaCreneau ? dispoCollabValeur(c.email) : undefined;
          return (
            <span
              key={c.email}
              className="inline-flex items-center gap-1.5 h-6 pl-2 pr-1 rounded-sm bg-surface-2 border border-line text-meta text-ink"
            >
              {c.nom}
              {d === "occupee" && <span className="text-warn-700">occupé</span>}
              <button
                type="button"
                onClick={() => onToggleCollaborateur(c.email)}
                disabled={pending}
                aria-label={`Retirer ${c.nom}`}
                className="text-ink-3 hover:text-err-700 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
              >
                <X strokeWidth={2} className="w-3 h-3" />
              </button>
            </span>
          );
        })}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={choixOuvert}
          disabled={pending}
          onClick={onToggleChoix}
        >
          <UserPlus strokeWidth={1.5} />
          {choixOuvert ? "Fermer la liste" : "Associer des collègues"}
        </Button>
      </span>

      {choixOuvert && (
        <span className="inline-flex flex-col gap-0.5">
          {collabAffiches.map((c) => (
            <label
              key={c.email}
              className="inline-flex items-center gap-1.5 text-body text-ink cursor-pointer"
            >
              <input
                type="checkbox"
                checked={collaborateursVal.includes(c.email)}
                disabled={pending}
                onChange={() => onToggleCollaborateur(c.email)}
                className="accent-green-700 w-3.5 h-3.5"
              />
              {c.nom}
            </label>
          ))}
          {/* Debordement : revele les collegues des autres agences. */}
          {collabAutres.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={onToggleVoirAutres}
              aria-expanded={voirAutres}
              disabled={pending}
            >
              {voirAutres
                ? "Masquer les autres agences"
                : "Voir les autres agences"}
            </Button>
          )}
        </span>
      )}
    </span>
  );
}
