"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, LogOut, ChevronsUpDown, UserCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { deconnecter } from "@/app/dev-login/actions";
import { Button } from "@/components/ui/button";

// Menu utilisateur, en pied du rail : avatar + nom, menu qui s'ouvre vers le haut
// (changer de gestionnaire si autorise, deconnexion).
export function UserMenu({
  user,
  peutImpersonner,
}: {
  user: { initiales: string; nomComplet: string };
  peutImpersonner: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.nomComplet}
        className="w-full flex items-center gap-2.5 px-2 h-11 rounded-md text-left text-rail-ink hover:bg-rail-2 transition-colors duration-120 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300"
      >
        <Avatar initiales={user.initiales} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block text-body font-medium truncate">{user.nomComplet}</span>
          <span className="block text-meta text-rail-muted">Connecté</span>
        </span>
        <ChevronsUpDown strokeWidth={1.5} className="w-3.5 h-3.5 text-rail-muted shrink-0" aria-hidden />
      </button>

      {open && (
        <>
          {/* clic exterieur pour fermer */}
          <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute left-0 right-0 bottom-full mb-2 z-20 rounded-lg border border-line bg-surface shadow-2 py-1 animate-scale-in"
          >
            <Link
              href="/delegations"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 h-9 text-body text-ink hover:bg-surface-2"
            >
              <UserCheck strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-2" /> Délégations
            </Link>
            {peutImpersonner && (
              <Link
                href="/dev-login"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 h-9 text-body text-ink hover:bg-surface-2"
              >
                <Users strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-2" /> Changer de gestionnaire
              </Link>
            )}
            <form action={deconnecter} className="px-1 pt-1">
              <Button type="submit" role="menuitem" variant="danger" className="w-full">
                <LogOut strokeWidth={1.5} /> Déconnexion
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
