import Link from "next/link";
import { Plus } from "lucide-react";
import type { Gestionnaire } from "@/lib/domain/dashboard";

type Props = { gestionnaire: Gestionnaire; dateCourante: string };

export function DashboardHeader({ gestionnaire, dateCourante }: Props) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <div className="text-[12.5px] text-ink-3">
          {dateCourante} · {gestionnaire.nomComplet}
        </div>
        <h1 className="mt-1 text-[26px] font-medium tracking-tight" style={{ letterSpacing: "-0.02em" }}>
          Ce qui demande votre attention
        </h1>
      </div>
      <Link
        href="/mes-evenements"
        className="inline-flex items-center justify-center gap-1.5 h-8 px-3 text-[13px] rounded-md font-medium leading-none border bg-green-700 text-white border-transparent hover:bg-green-600 transition-colors duration-75 [&>svg]:w-3.5 [&>svg]:h-3.5"
      >
        <Plus strokeWidth={1.5} /> Préparer une AG
      </Link>
    </div>
  );
}
