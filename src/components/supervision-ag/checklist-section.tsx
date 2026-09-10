"use client";

import { useState } from "react";
import { ChevronDown, Lock, Calculator } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  progressionSection,
  type ItemChecklist,
  type SectionChecklist,
  type StatutItem,
} from "@/lib/domain/supervision-ag";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChecklistItem } from "./checklist-item";

// Une PHASE de la checklist : un en-tete de 40 px (titre, n/total, %), un corps qui
// s'ouvre et se ferme en 180 ms (grid-template-rows 0fr -> 1fr, pas de mesure JS).
// Les phases s'empilent a la hairline dans un seul cadre (supervision-vue) : pas six
// cartes.

type ChecklistSectionProps = {
  section: SectionChecklist;
  /** Date ISO de l'AG (pour les echeances reglementaires des items), null si sans date. */
  agDateISO: string | null;
  aujourdhuiISO: string;
  lectureSeule?: boolean;
  /** Ouverte au chargement (= phase en cours). Les autres sont repliees. */
  ouvertParDefaut?: boolean;
  /** Phase verrouillee (palier non atteint) : grisee, non depliable, bouton "Deverrouiller". */
  verrouille?: boolean;
  /** Phase epinglee hors-paliers (Verifications comptables = "vue comptable"). */
  epingle?: boolean;
  onDeverrouiller?: () => void;
  onCocher: (itemId: string, statut: StatutItem) => Promise<void>;
  onCommenter: (itemId: string, commentaire: string) => Promise<void>;
  /** Ouvre le module interne d'un item (recap / depassement CS) en modale. */
  onOuvrirModule?: (item: ItemChecklist) => void;
};

export function ChecklistSection({
  section,
  agDateISO,
  aujourdhuiISO,
  lectureSeule,
  ouvertParDefaut = false,
  verrouille = false,
  epingle = false,
  onDeverrouiller,
  onCocher,
  onCommenter,
  onOuvrirModule,
}: ChecklistSectionProps) {
  const prog = progressionSection(section);
  const [ouvert, setOuvert] = useState(ouvertParDefaut);

  // Phase verrouillee : en-tete en tertiaire + cadenas, contenu masque, anti-blocage.
  if (verrouille) {
    return (
      <section className="flex items-center justify-between gap-3 px-4 min-h-10">
        <h3 className="text-body font-medium text-ink-3 flex items-center gap-2">
          <Lock strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" aria-hidden />
          {section.titre}
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-meta text-ink-3 hidden sm:inline">se déverrouille à la fin de la phase précédente</span>
          {!lectureSeule && onDeverrouiller && (
            <Button variant="ghost" size="sm" onClick={onDeverrouiller}>
              Déverrouiller
            </Button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-4 min-h-10 text-left transition-colors duration-120 hover:bg-surface-2/60",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset",
          ouvert && "border-b border-line",
        )}
      >
        <h3 className="text-body font-medium text-ink flex items-center gap-2">
          <ChevronDown
            strokeWidth={1.5}
            className={cn("w-4 h-4 text-ink-2 transition-transform duration-180 ease-out-quart", !ouvert && "-rotate-90")}
            aria-hidden
          />
          {epingle && <Calculator strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-2 shrink-0" aria-hidden />}
          {section.titre}
          {epingle && <Badge ton="outline">vue comptable</Badge>}
        </h3>
        <span className="flex items-center gap-3 text-body tabular-nums">
          <span className="text-ink-2">
            {prog.verifies} / {prog.total}
          </span>
          <span className={cn("font-medium w-10 text-right", prog.pourcentage === 100 ? "text-ok-700" : "text-ink")}>
            {prog.pourcentage} %
          </span>
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-180 ease-out-quart"
        style={{ gridTemplateRows: ouvert ? "1fr" : "0fr" }}
        // `inert` : le contenu replie n'est ni focusable ni lu par un lecteur d'ecran.
        inert={!ouvert}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="divide-y divide-line">
            {section.items.map((item) => (
              <ChecklistItem
                key={item.id}
                item={item}
                agDateISO={agDateISO}
                aujourdhuiISO={aujourdhuiISO}
                lectureSeule={lectureSeule}
                onCocher={onCocher}
                onCommenter={onCommenter}
                {...(onOuvrirModule ? { onOuvrirModule } : {})}
              />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
