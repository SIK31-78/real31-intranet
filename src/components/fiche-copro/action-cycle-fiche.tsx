"use client";

import { ArrowRight } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import type { ActionEcran } from "@/components/parcours/action-principale";

// Le CTA de l'action du moment sur la fiche (stepper "Ou en est cette AG") : LE bouton
// primaire de la page. L'action vient d'actionPrincipaleEcran(cycle, "fiche"), jamais
// codee en dur.
// Regle S2.A.4 : quand l'action est "fixer les dates", elle se joue ICI, sur la fiche
// (les crayons EditeurDate). Le bouton ne pointe donc PAS vers /copropriete/[code]
// (lien circulaire) : il fait un scroll + focus clavier vers le bloc des dates (ancre
// #dates-ag). Toute autre action (ODJ, supervision, conclure) reste un vrai lien.
export function ActionCycleFiche({ action, coproCode }: { action: ActionEcran; coproCode: string }) {
  // Action secondaire legitime au meme moment (ex. preparer l'ODJ pendant la phase
  // Dates - la preparation n'attend pas la date, retour collegue 2026-09-01).
  const secondaire = action.secondaire && (
    <ButtonLink
      href={action.secondaire.href}
      variant="ghost"
      title="La préparation n'attend pas la date : l'ODJ sera rattaché à l'AG quand sa date sera fixée"
    >
      {action.secondaire.label}
    </ButtonLink>
  );

  const circulaire = action.href === `/copropriete/${coproCode}`;

  return (
    <span className="inline-flex items-center gap-2">
      {secondaire}
      {circulaire || !action.href ? (
        <Button variant="primary" onClick={focusDates}>
          {action.label}
          <ArrowRight strokeWidth={1.5} />
        </Button>
      ) : (
        <ButtonLink href={action.href} variant="primary">
          {action.label}
          <ArrowRight strokeWidth={1.5} />
        </ButtonLink>
      )}
    </span>
  );
}

// Amene le bloc des dates au centre puis DEPLACE le focus clavier sur le premier
// controle (le crayon "Prochaine AG") : accessibilite, pas un simple scroll.
function focusDates() {
  const cible = document.getElementById("dates-ag");
  cible?.scrollIntoView({ behavior: "smooth", block: "center" });
  const premier = cible?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]");
  premier?.focus({ preventScroll: true });
}
