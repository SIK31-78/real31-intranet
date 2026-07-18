"use client";

// ZONE RESERVEE aux ADMINS REPRISE (directeur / manager / super-admin).
//
// Regle Sekou : on ne CACHE pas ce qui est reserve - on le GRISE avec une explication. Le
// gestionnaire voit que la fonction existe et sait a qui s'adresser (l'inverse d'un ecran qui
// change mysterieusement d'un compte a l'autre).
//
// Mecanique : un <fieldset disabled> desactive NATIVEMENT tous les controles imbriques (button,
// input, select, textarea) - aucun besoin de cabler un `disabled` sur 40 boutons, et rien ne peut
// etre oublie. Le grisage reste une COURTOISIE D'UI : la vraie garde est cote serveur (chaque
// Server Action / route API refuse un non-admin). Cf. lib/auth/roles.ts (estAdminReprise).

import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function ZoneAdminReprise({
  admin,
  children,
  raison,
  className,
}: {
  /** true = l'utilisateur est admin reprise -> le contenu est rendu tel quel, sans surcouche. */
  admin: boolean;
  children: ReactNode;
  /** Explication affichee au non-admin (ce que fait la zone + qui peut le faire). */
  raison: string;
  className?: string;
}) {
  if (admin) return <>{children}</>;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-start gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink-3">
        <Lock strokeWidth={1.5} className="w-3.5 h-3.5 mt-0.5 shrink-0 text-ink-4" />
        <span>
          <span className="font-medium text-ink-2">Reserve aux directeurs et managers.</span> {raison}
        </span>
      </div>
      {/* min-w-0 : un <fieldset> a un min-width intrinseque qui casserait les grilles/truncate. */}
      <fieldset disabled aria-label="Section reservee aux directeurs et managers" className="min-w-0 opacity-60">
        {children}
      </fieldset>
    </div>
  );
}
