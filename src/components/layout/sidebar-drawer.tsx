"use client";

// Enveloppe le rail (server component, recu en children) pour le rendre utilisable
// sous md: en tiroir plutot qu'en colonne fixe qui rendait l'app inutilisable en
// mobile. Des md: colonne statique, pleine hauteur, toujours visible.

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
          className="fixed inset-x-0 top-12 bottom-0 z-30 bg-rail/60 md:hidden animate-fade-in"
        />
      )}
      <div
        id="sidebar-mobile"
        className={cn(
          "fixed left-0 top-12 bottom-0 z-40 flex w-72 max-w-[88vw] transition-transform duration-240 ease-out-quart",
          ouvert ? "translate-x-0" : "-translate-x-full",
          // md:translate-none + transform-none (et non translate-x-0) : un translate, meme nul, ferait du tiroir
          // le bloc conteneur des enfants `fixed` (palette Ctrl+K, menu utilisateur) qui se
          // retrouveraient coinces dans les 240 px du rail.
          "md:static md:z-auto md:translate-none md:transform-none md:transition-none md:w-auto md:max-w-none",
        )}
      >
        {children}
      </div>
    </>
  );
}
