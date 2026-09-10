"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { deconnecter } from "@/app/dev-login/actions";
import { Button } from "@/components/ui/button";

// Menu utilisateur (avatar topbar) : changer de gestionnaire (super-admin / dev) +
// deconnexion. Le bouton "Changer de gestionnaire" n'apparait que si autorise.
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
      <Button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.nomComplet}
        variant="ghost"
      >
        <Avatar initiales={user.initiales} title={user.nomComplet} />
      </Button>

      {open && (
        <>
          {/* clic exterieur pour fermer */}
          <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 mt-2 w-56 z-20 rounded-lg border border-line bg-surface shadow-1 shadow-1 py-1"
          >
            <div className="px-3 py-2 border-b border-line">
              <p className="text-body font-medium text-ink truncate">{user.nomComplet}</p>
              <p className="text-meta text-ink-3">Connecté</p>
            </div>
            {peutImpersonner && (
              <Link
                href="/dev-login"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-body text-ink hover:bg-surface-2"
              >
                <Users strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3" /> Changer de gestionnaire
              </Link>
            )}
            <form action={deconnecter}>
              <Button
                type="submit"
                role="menuitem"
                variant="danger" size="lg" className="w-full"
              >
                <LogOut strokeWidth={1.5} className="w-3.5 h-3.5" /> Déconnexion
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
