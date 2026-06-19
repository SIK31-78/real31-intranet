import Link from "next/link";
import { Calendar } from "lucide-react";
import type { Gestionnaire } from "@/lib/domain/dashboard";

type Props = { gestionnaire: Gestionnaire; dateCourante: string };

export function DashboardHeader({ gestionnaire, dateCourante }: Props) {
  const prenom = gestionnaire.nomComplet.split(" ")[0];
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <div className="text-[12.5px] text-ink-3">{dateCourante}</div>
        <h1 className="mt-1 text-[26px] font-medium tracking-tight" style={{ letterSpacing: "-0.02em" }}>
          Bonjour {prenom}
        </h1>
      </div>
      <Link
        href="/calendrier"
        className="inline-flex items-center justify-center gap-1.5 h-8 px-3 text-[13px] rounded-md font-medium leading-none border border-line bg-surface text-ink-2 hover:border-line-2 hover:text-ink transition-colors duration-75 [&>svg]:w-3.5 [&>svg]:h-3.5"
      >
        <Calendar strokeWidth={1.5} /> Calendrier AG/CS
      </Link>
    </div>
  );
}
