import type { SupervisionAg } from "@/lib/domain/supervision-ag";
import { Icon } from "@/components/ui/icon";

export function BandeauConclue({ supervision }: { supervision: SupervisionAg }) {
  if (supervision.statut !== "conclue_archivee" || !supervision.visa) return null;
  return (
    <div className="bg-ok-50 border border-ok-500/30 rounded-md px-4 py-3 flex items-center gap-3">
      <Icon name="check-circle" className="w-5 h-5 text-ok-700 shrink-0" />
      <div className="text-[13px] text-ok-700">
        Supervision conclue par{" "}
        <span className="font-medium">{supervision.visa.initiales}</span> le{" "}
        <span className="font-medium font-mono">{supervision.visa.le}</span>.
        Fiche en lecture seule.
      </div>
    </div>
  );
}
