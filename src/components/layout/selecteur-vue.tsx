"use client";

// Le selecteur de vue (ADR-041) : Mon portefeuille · Mon agence / Mes delegations · Le
// cabinet. Absent quand une seule vue est permise : un gestionnaire ne voit rien de neuf.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { VuePerimetre } from "@/lib/domain/perimetre-ecriture";
import { useToast } from "@/components/ui/toast";
import { choisirVueAction } from "@/app/vue-actions";

export function SelecteurVue({ vues, libelles, active }: { vues: VuePerimetre[]; libelles: Record<VuePerimetre, string>; active: VuePerimetre }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  if (vues.length < 2) return null;
  return (
    <div role="group" aria-label="Périmètre affiché" className="inline-flex items-center rounded-md border border-line bg-surface-2 p-0.5">
      {vues.map((v) => (
        <button
          key={v}
          type="button"
          disabled={pending}
          aria-pressed={v === active}
          onClick={() =>
            demarrer(async () => {
              const res = await choisirVueAction(v);
              if (!res.ok) return toast.err(res.erreur);
              router.refresh();
            })
          }
          className={cn(
            "h-7 px-2.5 rounded-sm text-body transition-colors",
            v === active ? "bg-surface text-green-800 font-medium shadow-1" : "text-ink-2 hover:text-ink",
          )}
        >
          {libelles[v]}
        </button>
      ))}
      {pending && <Loader2 strokeWidth={1.5} className="w-3.5 h-3.5 animate-spin text-ink-3 mx-1.5" />}
    </div>
  );
}
