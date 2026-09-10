"use client";

import { useTransition } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";

type ConclureBoutonProps = {
  disabled: boolean;
  /** primary = LE primaire de l'ecran ; secondary quand l'action du moment se joue ailleurs. */
  variant: Extract<ButtonVariant, "primary" | "secondary">;
  onConclure: () => Promise<void>;
};

// La raison du "disabled" est ecrite SOUS le bouton par l'en-tete (plus un `title`).
export function ConclureBouton({ disabled, variant, onConclure }: ConclureBoutonProps) {
  const [pending, startTransition] = useTransition();
  const confirmer = useConfirm();
  const handleClick = async () => {
    if (disabled || pending) return;
    const ok = await confirmer({
      titre: "Conclure l'AG ?",
      message: "La fiche passe en lecture seule.",
      confirmer: "Conclure",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await onConclure();
    });
  };
  return (
    <Button variant={variant} onClick={handleClick} disabled={disabled} loading={pending}>
      Conclure l&apos;AG
    </Button>
  );
}
