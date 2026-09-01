"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ActionDuMoment } from "@/lib/domain/cycle-ag";

// Le CTA de l'action du moment sur la fiche (stepper "Ou en est cette AG").
// Regle S2.A.4 : quand l'action est "fixer les dates", elle se joue ICI, sur la fiche
// (les 4 crayons EditeurDate). Le bouton ne pointe donc PAS vers /copropriete/[code]
// (lien circulaire vers la page ou on est deja) : il fait un scroll + focus clavier vers
// le bloc des dates (ancre #dates-ag), pour amener l'utilisateur au lieu d'execution.
// Toute autre action (ODJ, supervision, conclure) reste un vrai lien vers son lieu.
export function ActionCycleFiche({
  action,
  coproCode,
}: {
  action: ActionDuMoment;
  coproCode: string;
}) {
  const classe =
    "inline-flex items-center gap-1 h-7 px-2.5 rounded-sm bg-green-700 text-surface text-[12px] font-medium hover:bg-green-600 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1";

  // Action secondaire legitime au meme moment (ex. preparer l'ODJ pendant la phase
  // Dates - la preparation n'attend pas la date, retour collegue 2026-09-01).
  const secondaire = action.secondaire && (
    <Link
      href={action.secondaire.href}
      title="La préparation n'attend pas la date : l'ODJ sera rattaché à l'AG quand sa date sera fixée"
      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-sm border border-line bg-surface text-[12px] font-medium text-ink-2 hover:border-line-2 hover:text-ink transition-colors shrink-0"
    >
      {action.secondaire.label}
    </Link>
  );

  // Action circulaire (elle se joue sur cette page) : scroll + focus vers les dates.
  if (action.href === `/copropriete/${coproCode}`) {
    return (
      <span className="inline-flex items-center gap-2">
        {secondaire}
        <button type="button" onClick={focusDates} className={classe}>
          {action.label}
          <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      {secondaire}
      <Link href={action.href} className={classe}>
        {action.label}
        <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
      </Link>
    </span>
  );
}

// Amene le bloc des dates au centre puis DEPLACE le focus clavier sur le premier
// controle (le crayon "Prochaine AG") : accessibilite, pas un simple scroll.
function focusDates() {
  const cible = document.getElementById("dates-ag");
  cible?.scrollIntoView({ behavior: "smooth", block: "center" });
  const premier = cible?.querySelector<HTMLElement>(
    "button, [href], input, select, textarea, [tabindex]",
  );
  premier?.focus({ preventScroll: true });
}
