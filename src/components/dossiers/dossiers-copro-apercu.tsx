import { FolderOpen, Plus } from "lucide-react";
import { Rows, Row } from "@/components/ui/list-rows";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TYPE_DOSSIER_LABEL,
  STATUT_DOSSIER_LABEL,
  progressionDossier,
  type Dossier,
} from "@/lib/domain/dossier";

// Apercu des dossiers d'une copro (onglet "Dossiers" de la fiche copro).
export function DossiersCoproApercu({ dossiers }: { dossiers: Dossier[] }) {
  const nouveau = (
    <ButtonLink href="/dossiers" variant="secondary" size="sm">
      <Plus strokeWidth={1.5} /> Nouveau dossier
    </ButtonLink>
  );

  if (dossiers.length === 0) {
    return (
      <EmptyState icone={FolderOpen} action={nouveau}>
        Aucun dossier ouvert
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-body text-ink-2 tabular-nums">
          {dossiers.length} dossier{dossiers.length > 1 ? "s" : ""}
        </span>
        {nouveau}
      </div>
      <Rows>
        {dossiers.map((d) => {
          const p = progressionDossier(d);
          return (
            <Row
              key={d.id}
              href={`/dossiers/${d.id}`}
              avant={
                <Badge ton="outline" className="w-24 justify-center font-sans">
                  {TYPE_DOSSIER_LABEL[d.type]}
                </Badge>
              }
              principal={d.titre}
              droite={
                <>
                  <span className="text-meta text-ink-2 tabular-nums">
                    {p.faites}/{p.total}
                  </span>
                  <Badge ton="neutral" dot>
                    {STATUT_DOSSIER_LABEL[d.statut]}
                  </Badge>
                </>
              }
            />
          );
        })}
      </Rows>
    </div>
  );
}
