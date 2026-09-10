import type { SupervisionAg } from "@/lib/domain/supervision-ag";
import { Callout } from "@/components/ui/callout";

export function BandeauConclue({ supervision }: { supervision: SupervisionAg }) {
  if (supervision.statut !== "conclue_archivee" || !supervision.visa) return null;
  return (
    <Callout ton="ok" titre="Supervision conclue">
      par {supervision.visa.initiales} le <span className="tabular-nums">{supervision.visa.le}</span> — fiche en
      lecture seule.
    </Callout>
  );
}
