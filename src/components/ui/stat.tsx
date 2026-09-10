import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Eyebrow } from "./eyebrow";

// Chiffre-cle : eyebrow + figure 28 px + note colorée optionnelle ("9 en retard").

const NOTE_TON = {
  neutral: "text-ink-2",
  ok: "text-ok-700",
  warn: "text-warn-700",
  err: "text-err-700",
} as const;

export function Stat({
  label,
  valeur,
  note,
  ton = "neutral",
}: {
  label: ReactNode;
  valeur: ReactNode;
  note?: ReactNode;
  ton?: keyof typeof NOTE_TON;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Eyebrow>{label}</Eyebrow>
      <div className="text-figure font-medium tracking-tight text-ink tabular-nums">{valeur}</div>
      {note && <div className={cn("text-meta font-medium", NOTE_TON[ton])}>{note}</div>}
    </div>
  );
}
