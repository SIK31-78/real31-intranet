"use client";

// Supprimer une proposition creee en double. DEFINITIF (Sekou, 14/10/2026 : pas de statut
// « doublon ») : la fenetre de confirmation le dit en toutes lettres avant d'agir.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { supprimerPropositionAction } from "@/app/propositions/actions";

export function SupprimerProposition({ propositionId, adresse }: { propositionId: string; adresse: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirmer = useConfirm();
  const [pending, demarrer] = useTransition();

  async function supprimer() {
    const ok = await confirmer({
      titre: "Supprimer définitivement cette proposition ?",
      message: `${adresse}. Toute suppression est irréversible : la fiche, le contact, le prix et le journal disparaissent, rien ne pourra être récupéré. À réserver à une proposition créée en double.`,
      confirmer: "Supprimer définitivement",
      danger: true,
    });
    if (!ok) return;
    demarrer(async () => {
      const res = await supprimerPropositionAction(propositionId);
      if (!res.ok) return toast.err(res.erreur);
      toast.ok("Proposition supprimée.");
      router.push("/propositions");
    });
  }

  return (
    <Button type="button" variant="danger" size="sm" onClick={supprimer} disabled={pending} title="Supprimer une proposition créée en double">
      {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <Trash2 strokeWidth={1.5} />} Supprimer
    </Button>
  );
}
