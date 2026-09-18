"use client";

// Onglet « Clés » de la fiche copro : les trousseaux qui ouvrent cette copropriété, avec
// leur etat. Donnees serialisees par la page ; rendu client parce que la fiche l'est.

import { KeySquare, Plus } from "lucide-react";
import { Rows } from "@/components/ui/list-rows";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { TrousseauResume } from "@/lib/services/cles/lecture";
import { LigneTrousseau } from "./ligne-trousseau";

export function TrousseauxCoproApercu({ trousseaux, coproCode }: { trousseaux: TrousseauResume[]; coproCode: string }) {
  const nouveau = (
    <ButtonLink href="/cles/trousseaux/nouveau" variant="secondary" size="sm">
      <Plus strokeWidth={1.5} /> Nouveau trousseau
    </ButtonLink>
  );
  if (trousseaux.length === 0) {
    return <EmptyState icone={KeySquare} action={nouveau}>Aucun trousseau rattaché à {coproCode}</EmptyState>;
  }
  const dehors = trousseaux.filter((t) => t.etat === "sorti" || t.etat === "en_retard").length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-body text-ink-2 tabular-nums">
          {trousseaux.length} trousseau{trousseaux.length > 1 ? "x" : ""}{dehors > 0 ? ` · ${dehors} dehors` : ""}
        </span>
        <span className="flex items-center gap-2">
          <ButtonLink href={`/cles?copro=${encodeURIComponent(coproCode)}`} variant="ghost" size="sm">Ouvrir au comptoir</ButtonLink>
          {nouveau}
        </span>
      </div>
      <Rows>{trousseaux.map((t) => <LigneTrousseau key={t.trousseau.id} resume={t} />)}</Rows>
    </div>
  );
}
