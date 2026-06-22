"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  progressionSection,
  type SectionChecklist,
  type StatutItem,
} from "@/lib/domain/supervision-ag";
import { ChecklistItem } from "./checklist-item";

type ChecklistSectionProps = {
  section: SectionChecklist;
  aujourdhuiISO: string;
  lectureSeule?: boolean;
  /** Ouverte au chargement (= phase en cours). Les autres sont repliees. */
  ouvertParDefaut?: boolean;
  onCocher: (itemId: string, statut: StatutItem) => Promise<void>;
  onCommenter: (itemId: string, commentaire: string) => Promise<void>;
};

export function ChecklistSection({
  section,
  aujourdhuiISO,
  lectureSeule,
  ouvertParDefaut = false,
  onCocher,
  onCommenter,
}: ChecklistSectionProps) {
  const prog = progressionSection(section);
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
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
          {section.titre}
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
