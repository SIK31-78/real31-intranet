"use client";

// « Démarrer le suivi » quand un sujet (ou un appareil) n'a encore aucun cycle : crée le
// premier cycle, avec l'échéance déjà connue du contrat courant quand il y en a une.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { SujetSuivi } from "@/lib/domain/contrats-copro";
import { demarrerSuiviAction } from "@/app/contrats-copro/actions";
import { jour } from "./commun";

export function BoutonDemarrerSuivi({ coproCode, sujet, ascenseurId, echeanceISO, size = "sm" }: { coproCode: string; sujet: SujetSuivi; ascenseurId?: string; echeanceISO?: string | null; size?: "sm" | "md" }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();

  function lancer() {
    demarrer(async () => {
      const res = await demarrerSuiviAction({ coproCode, sujet, ...(ascenseurId ? { ascenseurId } : {}), echeanceISO: echeanceISO ?? null });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(echeanceISO ? `Suivi démarré, échéance le ${jour(echeanceISO)}.` : "Suivi démarré : pense à saisir l'échéance.");
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="doux" size={size} loading={pending} onClick={lancer}>
      <Play strokeWidth={1.5} /> Démarrer le suivi
    </Button>
  );
}
