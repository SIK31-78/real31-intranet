"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import type { JalonCode } from "@/lib/domain/jalons-ag/types";
import { useToast } from "@/components/ui/toast";
import { confirmerJalonAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";

// Bouton "marquer fait" d'une echeance a confirmer (dashboard). Ecrit l'etat accompli
// du jalon ; la ligne disparait des "a confirmer" au refresh.
export function BoutonConfirmerJalon({
  coproCode,
  agDate,
  jalonCode,
}: {
  coproCode: string;
  agDate: string;
  jalonCode: JalonCode;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <Button
      disabled={pending}
      aria-busy={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startTransition(async () => {
          await confirmerJalonAction(coproCode, agDate, jalonCode);
          toast.ok("Échéance confirmée.");
        });
      }}
      variant="secondary" size="sm" className="shrink-0"
      title="Marquer cette échéance comme faite"
    >
      <Check strokeWidth={2} className="w-3.5 h-3.5" />
      Fait
    </Button>
  );
}
