import { SidebarMenuButton } from "@/components/layout/sidebar-menu-button";
import { CommandPalette } from "@/components/layout/command-palette";

// Barre mobile (sous md seulement) : marque, hamburger qui ouvre le rail en tiroir,
// recherche. Des md, elle disparait : le rail est une colonne fixe.
export function BarreMobile({ emailsOuvert = true }: { emailsOuvert?: boolean }) {
  return (
    <header className="md:hidden flex items-center gap-3 px-3 h-12 shrink-0 bg-rail text-rail-ink">
      <SidebarMenuButton />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.png" alt="" className="w-6 h-6 rounded-md object-contain shrink-0" />
      <span className="text-body font-semibold flex-1 truncate">REAL31</span>
      <CommandPalette emailsOuvert={emailsOuvert} variante="rail-icone" />
    </header>
  );
}
