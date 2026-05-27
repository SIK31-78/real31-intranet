import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <Button variant="primary">
        <Plus strokeWidth={1.5} /> Préparer une AG
      </Button>
    </div>
  );
}
