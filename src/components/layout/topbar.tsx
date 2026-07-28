import { CommandPalette } from "@/components/layout/command-palette";
import { UserMenu } from "@/components/layout/user-menu";
import { SidebarMenuButton } from "@/components/layout/sidebar-menu-button";

type TopbarProps = {
  user: { initiales: string; nomComplet: string };
  breadcrumb?: string;
  peutImpersonner?: boolean;
  emailsOuvert?: boolean;
};

export function Topbar({ user, breadcrumb, peutImpersonner = false, emailsOuvert = true }: TopbarProps) {
  return (
    <header className="flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-4 h-12 shrink-0 border-b border-line bg-surface">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <SidebarMenuButton />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.png" alt="REAL31" className="w-6 h-6 rounded-[5px] object-contain shrink-0" />
        <span className="text-[12.5px] font-medium shrink-0">REAL31</span>
        {breadcrumb && (
          <>
            <span className="text-ink-4 shrink-0">/</span>
            <span className="text-[12.5px] text-ink-2 truncate min-w-0">{breadcrumb}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <CommandPalette emailsOuvert={emailsOuvert} />
        <UserMenu user={user} peutImpersonner={peutImpersonner} />
      </div>
    </header>
  );
}
