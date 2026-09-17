"use client";

import { Eye, EyeOff, Copy, Pencil, Trash2 } from "lucide-react";
import { estRenseigne } from "@/lib/domain/coffre";
import { Button } from "@/components/ui/button";
import type { SecretOuvert } from "./coffre.utils";

// Une ligne de secret : titre + contexte, identifiant / URL, mot de passe masque,
// et les gestes (afficher, copier, modifier, supprimer).
export function LigneSecret({
  s,
  revele,
  busy,
  onBasculer,
  onEditer,
  onSupprimer,
}: {
  s: SecretOuvert;
  revele: boolean;
  busy: boolean;
  onBasculer: () => void;
  onEditer: () => void;
  onSupprimer: () => void;
}) {
  return (
    <li className="px-4 py-2.5 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-body text-ink truncate">
          {s.clair.titre}
          {[s.clair.copropriete, s.clair.immeuble].some(estRenseigne) && (
            <span className="text-ink-3 font-normal">
              {" "}
              - {[s.clair.copropriete, s.clair.immeuble].filter(estRenseigne).join(" - ")}
            </span>
          )}
        </div>
        <div className="text-meta text-ink-3 truncate">
          {[s.clair.login, s.clair.url].filter(estRenseigne).join(" - ")}
        </div>
      </div>
      <code className="text-body text-ink-2 font-mono">
        {revele ? s.clair.motDePasse : "........"}
      </code>
      <Button onClick={onBasculer} variant="ghost" iconOnly title="Afficher/masquer">
        {revele ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </Button>
      <Button
        onClick={() => navigator.clipboard?.writeText(s.clair.motDePasse)}
        variant="ghost" iconOnly
        title="Copier"
      >
        <Copy className="w-3.5 h-3.5" />
      </Button>
      <Button onClick={onEditer} variant="ghost" iconOnly title="Modifier">
        <Pencil className="w-3.5 h-3.5" />
      </Button>
      <Button onClick={onSupprimer} disabled={busy} variant="ghost" iconOnly title="Supprimer">
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </li>
  );
}
