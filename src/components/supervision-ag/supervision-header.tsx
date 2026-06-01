import {
  peutConclure,
  type Role,
  type SupervisionAg,
} from "@/lib/domain/supervision-ag";
import { ConclureBouton } from "./conclure-bouton";

type SupervisionHeaderProps = {
  supervision: SupervisionAg;
  role: Role;
  onConclure: () => Promise<void>;
};

function calculRaisonDisabled(
  supervision: SupervisionAg,
  role: Role,
): "role" | "probleme" | null {
  if (role !== "gestionnaire") return "role";
  const aProbleme = supervision.sections
    .flatMap((s) => s.items)
    .some((i) => i.statut === "probleme");
  if (aProbleme) return "probleme";
  return null;
}

export function SupervisionHeader({
  supervision,
  role,
  onConclure,
}: SupervisionHeaderProps) {
  const concluable = peutConclure(supervision, role);
  const dejaConclue = supervision.statut === "conclue_archivee";
  const raison = calculRaisonDisabled(supervision, role);
  return (
    <div className="bg-surface border border-line rounded-md p-5 flex items-start justify-between gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-medium tracking-tight text-ink">
            Supervision AG : {supervision.copro.nomCourt}
          </h1>
          <span className="font-mono text-[14px] text-ink-3">
            {supervision.copro.code}
          </span>
        </div>
        <div className="mt-1 text-[13px] text-ink-2">
          AG cible :{" "}
          <span className="font-medium font-mono">{supervision.dateAgCible}</span>
        </div>
      </div>
      {!dejaConclue && (
        <ConclureBouton
          disabled={!concluable}
          role={role}
          raisonDisabled={raison}
          onConclure={onConclure}
        />
      )}
    </div>
  );
}
