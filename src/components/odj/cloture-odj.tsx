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
import { Choix, Input } from "@/components/ui/field";

function dateLisible(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Heure de fin de la reunion, saisie a la main et corrigeable A TOUT MOMENT - y compris
 * une fois l'ODJ clos, puisque c'est la qu'on la connait (remontee d'une collegue,
 * 07/10/2026 : clore le lendemain ecrivait l'heure du clic, et rien ne permettait de la
 * corriger). Vide = le document retombe sur l'heure de cloture.
 */
function HeureFin({
  valeur,
  onSaisir,
}: {
  valeur?: string;
  onSaisir: (valeur: string) => Promise<void>;
}) {
  const [texte, setTexte] = useState(valeur ?? "");
  const [pending, demarrer] = useTransition();

  function enregistrer() {
    const propre = texte.trim();
    if (propre === (valeur ?? "")) return;
    demarrer(async () => {
      await onSaisir(propre);
    });
  }

  return (
    <label className="flex items-center gap-2 text-body text-ink-2">
      Fin de réunion
      <Input
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={enregistrer}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        placeholder="20h30"
        aria-label="Heure de fin de la réunion du conseil syndical"
        disabled={pending}
        className="w-24"
      />
    </label>
  );
}

export function ClotureOdjBloc({
  cloture,
  finReunion,
  onCloturer,
  onSaisirFinReunion,
}: {
  cloture?: ClotureOdj;
  /** Heure de fin deja saisie. */
  finReunion?: string;
  onCloturer: (clore: boolean) => Promise<void>;
  /** Enregistre l'heure de fin (cle reservee de l'etat de l'ODJ). */
  onSaisirFinReunion: (valeur: string) => Promise<void>;
}) {
  const [confirme, setConfirme] = useState(false);
  const [pending, demarrer] = useTransition();

  if (cloture) {
    return (
      <Callout
        ton="ok"
        titre="Réunion terminée, ordre du jour clôturé"
        actions={
          <>
            <HeureFin {...(finReunion ? { valeur: finReunion } : {})} onSaisir={onSaisirFinReunion} />
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
          </>
        }
      >
        le {dateLisible(cloture.le)}{cloture.par ? ` par ${cloture.par}` : ""}. Le compte rendu se dépose à la
        main sur l&apos;extranet, puis se coche dans la supervision.
      </Callout>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-4 min-h-12 py-2 text-body">
      <div className="flex flex-wrap items-center gap-4">
        <Choix
          type="checkbox"
          label="Le conseil syndical s'est tenu : je confirme que la réunion a eu lieu."
          checked={confirme}
          onChange={(e) => setConfirme(e.target.checked)}
        />
        <HeureFin {...(finReunion ? { valeur: finReunion } : {})} onSaisir={onSaisirFinReunion} />
      </div>
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
