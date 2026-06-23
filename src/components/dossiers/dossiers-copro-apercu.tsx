import Link from "next/link";
import { FolderOpen, Plus, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TYPE_DOSSIER_LABEL,
  STATUT_DOSSIER_LABEL,
  progressionDossier,
  type Dossier,
} from "@/lib/domain/dossier";

// Apercu des dossiers d'une copro (onglet "Dossiers" de la fiche copro).
export function DossiersCoproApercu({ dossiers }: { dossiers: Dossier[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-ink-3">
          {dossiers.length} dossier{dossiers.length > 1 ? "s" : ""} sur cette copropriété
        </span>
        <Link
          href="/dossiers"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line bg-surface text-[13px] text-ink-2 hover:border-line-2 transition-colors"
        >
          <Plus strokeWidth={1.5} className="w-3.5 h-3.5" /> Nouveau dossier
        </Link>
      </div>

      {dossiers.length === 0 ? (
        <Card>
          <div className="px-4 py-8 text-center">
            <FolderOpen strokeWidth={1.5} className="w-6 h-6 text-ink-4 mx-auto mb-2" />
            <p className="text-[13px] text-ink-3">Aucun dossier ouvert sur cette copropriété.</p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {dossiers.map((d) => {
              const p = progressionDossier(d);
              return (
                <li key={d.id}>
                  <Link
                    href={`/dossiers/${d.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"
                  >
                    <Badge ton="outline" className="shrink-0 w-[100px] justify-center">{TYPE_DOSSIER_LABEL[d.type]}</Badge>
                    <span className="flex-1 text-[13px] font-medium text-ink truncate min-w-0">{d.titre}</span>
                    <span className="text-[11px] text-ink-3 font-mono shrink-0">{p.faites}/{p.total}</span>
                    <Badge ton="neutral" dot className="shrink-0">{STATUT_DOSSIER_LABEL[d.statut]}</Badge>
                    <ChevronRight strokeWidth={1.5} className="w-4 h-4 text-ink-4 shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
