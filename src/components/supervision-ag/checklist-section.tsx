"use client";

import { useState } from "react";
import { ChevronDown, Lock, Calculator } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  progressionSection,
  type SectionChecklist,
  type StatutItem,
} from "@/lib/domain/supervision-ag";
import { ChecklistItem } from "./checklist-item";

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
}: ChecklistSectionProps) {
  const prog = progressionSection(section);
  const [ouvert, setOuvert] = useState(ouvertParDefaut);

  // Phase verrouillee : en-tete grise + cadenas, contenu masque, anti-blocage.
  if (verrouille) {
    return (
      <section className="bg-surface-2/40 border border-dashed border-line rounded-md">
        <div className="w-full flex items-center justify-between px-4 py-3">
          <h3 className="text-[14px] font-medium text-ink-3 flex items-center gap-2">
            <Lock strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4 shrink-0" />
            {section.titre}
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-[11.5px] text-ink-4 hidden sm:inline">
              se déverrouille à la fin de la phase précédente
            </span>
            {!lectureSeule && onDeverrouiller && (
              <button
                type="button"
                onClick={onDeverrouiller}
                className="text-[12px] text-info-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded"
              >
                Déverrouiller
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-surface border border-line rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-line bg-surface-2/40 hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset"
      >
        <h3 className="text-[14px] font-medium text-ink flex items-center gap-2">
          <ChevronDown
            strokeWidth={1.5}
            className={cn("w-4 h-4 text-ink-3 transition-transform", ouvert ? "" : "-rotate-90")}
          />
          {epingle && <Calculator strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 shrink-0" />}
          {section.titre}
          {epingle && (
            <span className="text-[11px] font-normal text-ink-4 border border-line rounded px-1.5 py-0.5">
              vue comptable
            </span>
          )}
        </h3>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] text-ink-3">
            {prog.verifies} / {prog.total}
          </span>
          <span className={cn("text-[12px] font-medium", prog.pourcentage === 100 ? "text-ok-700" : "text-ink-2")}>
            {prog.pourcentage}%
          </span>
        </div>
      </button>
      {ouvert && (
        <div>
          {section.items.map((item) => (
            <ChecklistItem
              key={item.id}
              item={item}
              agDateISO={agDateISO}
              aujourdhuiISO={aujourdhuiISO}
              lectureSeule={lectureSeule}
              onCocher={onCocher}
              onCommenter={onCommenter}
            />
          ))}
        </div>
      )}
    </section>
  );
}
