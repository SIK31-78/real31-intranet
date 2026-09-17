"use client";

import { Plus, X } from "lucide-react";
import type { MembreAffiche } from "@/app/coffre/actions";
import type { CollaborateurAnnuaire } from "@/lib/domain/coffre";
import { Button } from "@/components/ui/button";

// Membres d'un coffre partage (admin) : la liste avec retrait, puis les candidats a
// ajouter. Le chargement et l'enrobage de la cle restent dans le panneau du coffre.
export function MembresCoffre({
  membres,
  candidats,
  monUserId,
  busy,
  onRetirer,
  onOctroyer,
}: {
  membres: MembreAffiche[] | null;
  candidats: CollaborateurAnnuaire[];
  monUserId: string;
  busy: boolean;
  onRetirer: (userId: string) => void;
  onOctroyer: (membre: CollaborateurAnnuaire) => void;
}) {
  return (
    <div className="px-4 py-3 border-b border-line bg-surface-2/40 flex flex-col gap-2">
      <div className="text-body font-medium text-ink-2">Membres</div>
      {membres === null ? (
        <div className="text-body text-ink-3">Chargement...</div>
      ) : (
        <ul className="flex flex-col gap-1">
          {membres.map((m) => (
            <li key={m.userId} className="flex items-center justify-between text-body">
              <span className="text-ink">
                {m.nom} {m.role === "admin" && <span className="text-ink-3">(admin)</span>}
              </span>
              {m.userId !== monUserId && (
                <Button onClick={() => onRetirer(m.userId)} disabled={busy} variant="danger" title="Retirer">
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {candidats.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {candidats.map((a) => (
            <Button
              key={a.id}
              onClick={() => onOctroyer(a)}
              disabled={busy}
              variant="ghost"
            >
              <Plus className="w-3 h-3" strokeWidth={2} /> {a.nomComplet || a.email}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
