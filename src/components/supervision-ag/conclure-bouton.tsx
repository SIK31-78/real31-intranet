"use client";

import { useTransition } from "react";
import { cn } from "@/lib/cn";
import { useConfirm } from "@/components/ui/confirm";
import type { Role } from "@/lib/domain/supervision-ag";

type ConclureBoutonProps = {
  disabled: boolean;
  role: Role;
  raisonDisabled: "role" | "probleme" | "incomplet" | null;
  onConclure: () => Promise<void>;
};

export function ConclureBouton({
  disabled,
  role,
  raisonDisabled,
  onConclure,
}: ConclureBoutonProps) {
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
  const title =
    raisonDisabled === "role"
      ? "Seul le gestionnaire de la copro peut conclure"
      : raisonDisabled === "probleme"
        ? "Items en statut Problème - résoudre avant de conclure"
        : raisonDisabled === "incomplet"
          ? "Checklist incomplète - traiter tous les items avant de conclure"
          : `Connecté en tant que ${role}`;
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || pending}
      title={title}
      className={cn(
        "h-9 px-4 rounded-sm font-medium text-[13px] transition-colors duration-75",
        "bg-green-700 text-surface hover:bg-green-600",
        "disabled:bg-surface-2 disabled:text-ink-3 disabled:cursor-not-allowed",
      )}
    >
      {pending ? "Conclusion..." : "Conclure l'AG"}
    </button>
  );
}
