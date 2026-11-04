import type { ReactNode } from "react";
import Link from "next/link";
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
  href,
  actif = false,
}: {
  label: ReactNode;
  valeur: ReactNode;
  note?: ReactNode;
  ton?: keyof typeof NOTE_TON;
  /** Rend la tuile cliquable (ex. liste filtree). */
  href?: string;
  /** Tuile cliquable dont le filtre est en cours : fond et contour marques. */
  actif?: boolean;
}) {
  const contenu = (
    <>
      <Eyebrow>{label}</Eyebrow>
      <div className="text-figure font-medium tracking-tight text-ink tabular-nums">{valeur}</div>
      {note && <div className={cn("text-meta font-medium", NOTE_TON[ton])}>{note}</div>}
    </>
  );
  if (!href) return <div className="flex flex-col gap-1">{contenu}</div>;
  return (
    <Link
      href={href}
      aria-current={actif ? "true" : undefined}
      className={cn(
        "flex flex-col gap-1 rounded-md border px-3 py-2transition-colors duration-120 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600",
        actif ? "border-line bg-surface-2" : "border-transparent hover:bg-surface-2",
      )}
    >
      {contenu}
    </Link>
  );
}
