"use client";

// Bouton de repli de la sidebar, place dans la Topbar a cote du hamburger et
// COMPLEMENTAIRE de lui : le hamburger sert sous md: (tiroir mobile), celui-ci des md:
// (colonne fixe). Il est dans la topbar et non dans la sidebar pour deux raisons :
// une bande d'en-tete dans la sidebar coutait ~44 px de vide au-dessus du premier
// groupe, et le bouton ne bouge pas quand la colonne se replie.

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useNavRepli } from "@/components/layout/nav-repli-context";

export function BoutonRepliNav() {
  const { repli, basculer } = useNavRepli();
  const Icone = repli ? PanelLeftOpen : PanelLeftClose;

  return (
    <button
      type="button"
      onClick={basculer}
      aria-label={repli ? "Déplier la navigation" : "Replier la navigation"}
      aria-expanded={!repli}
      title={repli ? "Déplier la navigation" : "Replier la navigation"}
      className="hidden md:flex items-center justify-center w-7 h-7 rounded-md text-ink-2 hover:bg-surface-2 transition-colors duration-75 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1"
    >
      <Icone strokeWidth={1.5} className="w-4 h-4" />
    </button>
  );
}
