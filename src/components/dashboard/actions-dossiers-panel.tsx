import Link from "next/link";
import { FolderOpen, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ActionsDossierCopro } from "@/lib/domain/dossier";

// Panneau "Dossiers a suivre" (C3) : la prochaine etape de chaque dossier ouvert,
// groupee par copro. Chaque ligne renvoie au dossier. Vide -> rien a suivre.
export function ActionsDossiersPanel({ actions }: { actions: ActionsDossierCopro[] }) {
  const total = actions.reduce((n, g) => n + g.actions.length, 0);
  if (total === 0) return null; // pas de bruit si aucun dossier ouvert n'a d'etape a faire

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dossiers à suivre ({total})</CardTitle>
      </CardHeader>
      <div className="px-4 pb-2">
        {actions.map((grp) => (
          <div key={grp.coproCode} className="py-2 border-b border-line last:border-b-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[12px] text-ink-2">{grp.coproCode}</span>
              <span className="text-[12.5px] font-medium text-ink truncate">{grp.coproNom}</span>
            </div>
            <ul className="flex flex-col gap-0.5">
              {grp.actions.map((a) => (
                <li key={a.dossierId}>
                  <Link
                    href={`/dossiers/${a.dossierId}`}
                    className="flex items-center gap-2 text-[13px] rounded px-1.5 py-1 -mx-1.5 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset"
                  >
                    <FolderOpen
                      className="w-3.5 h-3.5 text-ink-4 shrink-0"
                      strokeWidth={1.5}
                      aria-hidden={true}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-ink-3">{a.titre} - </span>
                      <span className="text-ink">{a.etapeLabel}</span>
                    </span>
                    {a.assigneA && (
                      <Badge ton="outline" className="shrink-0">
                        {a.assigneA === "gestionnaire" ? "Gest." : "Assist."}
                      </Badge>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-ink-4 shrink-0" strokeWidth={1.5} aria-hidden={true} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
