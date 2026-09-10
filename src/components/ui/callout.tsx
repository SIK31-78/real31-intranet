import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/cn";

// Bandeau d'information : UNE ligne par defaut, deux au plus. Un statut, un fait,
// une action a droite. Ce n'est ni une aide (-> <Aide>) ni un fond decoratif.

export type CalloutTon = "neutral" | "info" | "ok" | "warn" | "err";

const TONS: Record<CalloutTon, { cadre: string; icone: typeof Info }> = {
  neutral: { cadre: "border-line bg-surface-2 text-ink-2 [&_strong]:text-ink", icone: Info },
  info: { cadre: "border-info-500/30 bg-info-50 text-info-700", icone: Info },
  ok: { cadre: "border-ok-500/30 bg-ok-50 text-ok-700", icone: CheckCircle2 },
  warn: { cadre: "border-warn-500/30 bg-warn-50 text-warn-700", icone: AlertTriangle },
  err: { cadre: "border-err-500/30 bg-err-50 text-err-700", icone: AlertCircle },
};

export function Callout({
  ton = "neutral",
  titre,
  actions,
  children,
  className,
}: {
  ton?: CalloutTon;
  /** Le fait, en gras, avant le texte. */
  titre?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { cadre, icone: Icone } = TONS[ton];
  return (
    <div
      role={ton === "err" ? "alert" : "status"}
      className={cn("flex items-center gap-2.5 rounded-md border px-3.5 py-2 text-body", cadre, className)}
    >
      <Icone strokeWidth={1.5} className="w-4 h-4 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0 [&_a]:underline [&_a]:underline-offset-2 [&_a]:font-medium">
        {titre && <strong className="font-medium">{titre}</strong>}
        {titre && children ? " — " : null}
        {children}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
