import Link from "next/link";
import { Bell } from "lucide-react";
import { CommandPalette } from "@/components/layout/command-palette";
import { UserMenu } from "@/components/layout/user-menu";

type TopbarProps = {
  user: { initiales: string; nomComplet: string };
  breadcrumb?: string;
  peutImpersonner?: boolean;
};

export function Topbar({ user, breadcrumb, peutImpersonner = false }: TopbarProps) {
  return (
    <header className="flex items-center justify-between gap-4 px-4 h-12 shrink-0 border-b border-line bg-surface">
      <div className="flex items-center gap-3 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.png" alt="REAL31" className="w-6 h-6 rounded-[5px] object-contain shrink-0" />
        <span className="text-[12.5px] font-medium">REAL31</span>
        {breadcrumb && (
          <>
            <span className="text-ink-4">/</span>
            <span className="text-[12.5px] text-ink-2 truncate">{breadcrumb}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <CommandPalette />
        <Link
          href="/mes-evenements"
          aria-label="Actions à traiter"
          title="Actions à traiter"
          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-ink-2 hover:bg-surface-2 transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1"
        >
          <Bell strokeWidth={1.5} className="w-3.5 h-3.5" />
        </Link>
        <UserMenu user={user} peutImpersonner={peutImpersonner} />
      </div>
    </header>
  );
}
