import { cn } from "@/lib/cn";
import type { Severite } from "@/lib/domain/dashboard";

// Pastille J-x : le numero de jour + la couleur qui porte la severite.
const SEVERITES: Record<Severite, string> = {
  late: "bg-err-50 text-err-700 border-[#f3c1c1]",
  soon: "bg-warn-50 text-warn-700 border-[#f0dcae]",
  ok: "bg-surface-2 text-ink-3 border-line",
};

type JalonPillProps = { label: string; severite: Severite; className?: string };

export function JalonPill({ label, severite, className }: JalonPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[42px] h-[22px] px-1.5 rounded-sm",
        "text-[12px] font-medium font-mono border",
        SEVERITES[severite],
        className,
      )}
    >
      {label}
    </span>
  );
}
