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
  onCocher: (itemId: string, statut: StatutItem) => Promise<void>;
  onCommenter: (itemId: string, commentaire: string) => Promise<void>;
};

export function ChecklistSection({
  section,
  aujourdhuiISO,
  lectureSeule,
  onCocher,
  onCommenter,
}: ChecklistSectionProps) {
  const prog = progressionSection(section);
  return (
    <section className="bg-surface border border-line rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface-2/40">
        <h3 className="text-[14px] font-medium text-ink">{section.titre}</h3>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] text-ink-3">
            {prog.verifies} / {prog.total}
          </span>
          <span className="text-[12px] font-medium text-ink-2">
            {prog.pourcentage}%
          </span>
        </div>
      </div>
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
    </section>
  );
}
