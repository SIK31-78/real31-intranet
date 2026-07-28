"use client";

// Enveloppe la Sidebar (server component, recue en children) pour la rendre
// utilisable sous md: en tiroir plutot qu'en colonne fixe de 216px qui rendait
// l'app inutilisable en mobile. Des md: le comportement est celui d'origine
// (colonne statique toujours visible) : seules les classes de positionnement
// mobile sont neutralisees par les variantes md:.

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useMobileSidebar } from "@/components/layout/mobile-sidebar-context";
import { cn } from "@/lib/cn";

export function SidebarDrawer({ children }: { children: ReactNode }) {
  const { ouvert, fermer } = useMobileSidebar();
  const pathname = usePathname();

  // Ferme automatiquement le tiroir a chaque navigation.
  useEffect(() => {
    fermer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : reagit au changement de route, pas a `fermer`
  }, [pathname]);

  // Echap ferme le tiroir (comportement standard des panneaux mobiles).
  useEffect(() => {
    if (!ouvert) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") fermer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ouvert, fermer]);

  return (
    <>
      {/* Overlay mobile : clic pour fermer. Absent des md:. */}
      {ouvert && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={fermer}
          className="fixed inset-x-0 top-12 bottom-0 z-30 bg-black/30 md:hidden"
        />
      )}
      <div
        id="sidebar-mobile"
        className={cn(
          "fixed left-0 top-12 bottom-0 z-40 flex w-[216px] transform transition-transform duration-200 ease-in-out",
          ouvert ? "translate-x-0" : "-translate-x-full",
          "md:static md:z-auto md:translate-x-0 md:transition-none",
        )}
      >
        {children}
      </div>
    </>
  );
}
