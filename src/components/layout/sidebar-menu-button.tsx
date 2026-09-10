"use client";

// Bouton hamburger de la barre mobile : ouvre/ferme le rail en tiroir. Invisible des
// md: (le rail redevient la colonne fixe habituelle).

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
      className="flex md:hidden items-center justify-center w-8 h-8 rounded-md text-rail-ink hover:bg-rail-2 transition-colors duration-120 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300"
    >
      {ouvert ? <X strokeWidth={1.5} className="w-4 h-4" /> : <Menu strokeWidth={1.5} className="w-4 h-4" />}
    </button>
  );
}
