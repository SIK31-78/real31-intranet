import { cn } from "@/lib/cn";
import {
  progressionGlobale,
  type StatutItem,
  type SupervisionAg,
} from "@/lib/domain/supervision-ag";

function compterParStatut(supervision: SupervisionAg): Record<StatutItem, number> {
  const acc: Record<StatutItem, number> = {
    ok: 0,
    probleme: 0,
    non_applicable: 0,
    non_verifie: 0,
  };
  for (const s of supervision.sections) {
    for (const i of s.items) acc[i.statut]++;
  }
  return acc;
}

const DOTS: Record<"ok" | "err" | "neutral" | "ghost", string> = {
  ok: "bg-ok-500",
  err: "bg-err-500",
  neutral: "bg-ink-3",
  ghost: "bg-line-2",
};

function Breakdown({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "ok" | "err" | "neutral" | "ghost";
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", DOTS[tone])} />
      <span className="text-ink-2 font-medium font-mono">{count}</span>
      <span>{label}</span>
    </span>
  );
}

export function ProgressionGlobale({ supervision }: { supervision: SupervisionAg }) {
  const progression = progressionGlobale(supervision);
  const counts = compterParStatut(supervision);
  return (
    <div className="bg-surface border border-line rounded-md p-5">
      <div className="flex items-baseline gap-4">
        <span
          className="text-[34px] font-medium leading-none tracking-tight text-ink"
          style={{ letterSpacing: "-0.02em" }}
        >
          {progression.pourcentage}%
        </span>
        <div className="text-[13px] text-ink-2">
          <span className="font-mono font-medium">{progression.verifies}</span>{" "}
          <span className="text-ink-3">vérifiés sur</span>{" "}
          <span className="font-mono font-medium">{progression.total}</span>{" "}
          <span className="text-ink-3">items</span>
        </div>
      </div>
      <div className="mt-3 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-700 transition-[width] duration-200"
          style={{ width: `${progression.pourcentage}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-3">
        <Breakdown label="OK" count={counts.ok} tone="ok" />
        <Breakdown label="Problème" count={counts.probleme} tone="err" />
        <Breakdown label="N/A" count={counts.non_applicable} tone="neutral" />
        <Breakdown label="À vérifier" count={counts.non_verifie} tone="ghost" />
      </div>
    </div>
  );
}
