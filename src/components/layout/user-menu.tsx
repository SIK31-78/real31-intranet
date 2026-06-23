"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { deconnecter } from "@/app/dev-login/actions";

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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.nomComplet}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1"
      >
        <Avatar initiales={user.initiales} title={user.nomComplet} />
      </button>

      {open && (
        <>
          {/* clic exterieur pour fermer */}
          <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 mt-2 w-56 z-20 rounded-md border border-line bg-surface shadow-1 py-1"
          >
            <div className="px-3 py-2 border-b border-line">
              <p className="text-[13px] font-medium text-ink truncate">{user.nomComplet}</p>
              <p className="text-[11px] text-ink-3">Connecté</p>
            </div>
            {peutImpersonner && (
              <Link
                href="/dev-login"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-[13px] text-ink hover:bg-surface-2"
              >
                <Users strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3" /> Changer de gestionnaire
              </Link>
            )}
            <form action={deconnecter}>
              <button
                type="submit"
                role="menuitem"
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-err-700 hover:bg-surface-2"
              >
                <LogOut strokeWidth={1.5} className="w-3.5 h-3.5" /> Déconnexion
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
