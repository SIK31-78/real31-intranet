"use client";

// Cloture de l'ODJ en "reunion terminee" (demande Sekou 2026-07-28) : le CS preparatoire
// s'est tenu, le document est fige, on passe a la supervision AG.
//
// Ce que ce bloc dit HONNETEMENT : la cloture ne diffuse RIEN. Le depot du compte rendu
// sur l'extranet reste un geste manuel tant que la generation de PDF + le depot eStale
// n'existent pas. On l'ecrit a l'ecran plutot que de laisser croire que c'est fait --
// et on ne coche surtout pas l'item de supervision correspondant a notre place.
//
// Refonte 2026-09 : document OUVERT -> ce bloc porte LE primaire de l'ecran ("Marquer
// la reunion terminee", derriere sa case a cocher). Document CLOS -> un Callout d'une
// ligne + "Rouvrir" ; le passage a la supervision est le primaire de l'en-tete de page.

import { useState, useTransition } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import type { ClotureOdj } from "@/lib/domain/odj";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Choix } from "@/components/ui/field";

function dateLisible(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function ClotureOdjBloc({
  cloture,
  onCloturer,
}: {
  cloture?: ClotureOdj;
  onCloturer: (clore: boolean) => Promise<void>;
}) {
  const [confirme, setConfirme] = useState(false);
  const [pending, demarrer] = useTransition();

  if (cloture) {
    return (
      <Callout
        ton="ok"
        titre="Réunion terminée, ordre du jour clôturé"
        actions={
          <Button
            size="sm"
            variant="ghost"
            loading={pending}
            onClick={() => demarrer(async () => { await onCloturer(false); })}
            title="Rouvrir l'ODJ (aucune diffusion n'a été engagée)"
          >
            <RotateCcw strokeWidth={1.5} />
            Rouvrir
          </Button>
        }
      >
        le {dateLisible(cloture.le)}{cloture.par ? ` par ${cloture.par}` : ""}. Le compte rendu se dépose à la
        main sur l&apos;extranet, puis se coche dans la supervision.
      </Callout>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-4 min-h-12 py-2 text-body">
      <Choix
        type="checkbox"
        label="Le conseil syndical s'est tenu : je confirme que la réunion a eu lieu."
        checked={confirme}
        onChange={(e) => setConfirme(e.target.checked)}
      />
      <Button
        variant="primary"
        loading={pending}
        disabled={!confirme}
        onClick={() => demarrer(async () => { await onCloturer(true); })}
        title="Fige l'ordre du jour et ouvre la supervision AG. Réversible : rien n'est envoyé ni diffusé."
      >
        <CheckCircle2 strokeWidth={1.5} />
        Marquer la réunion terminée
      </Button>
    </div>
  );
}
