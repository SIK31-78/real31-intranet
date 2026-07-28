"use client";

// Bouton hamburger de la Topbar : ouvre/ferme le tiroir de navigation mobile.
// Invisible des md: (la sidebar redevient la colonne fixe habituelle).

import { Menu, X } from "lucide-react";
import { useMobileSidebar } from "@/components/layout/mobile-sidebar-context";

export function SidebarMenuButton() {
  const { ouvert, basculer } = useMobileSidebar();

  return (
    <button
      type="button"
      onClick={basculer}
      aria-label={ouvert ? "Fermer le menu" : "Ouvrir le menu"}
      aria-expanded={ouvert}
      aria-controls="sidebar-mobile"
      className="flex md:hidden items-center justify-center w-7 h-7 rounded-md text-ink-2 hover:bg-surface-2 transition-colors duration-75 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1"
    >
      {ouvert ? <X strokeWidth={1.5} className="w-4 h-4" /> : <Menu strokeWidth={1.5} className="w-4 h-4" />}
    </button>
  );
}
