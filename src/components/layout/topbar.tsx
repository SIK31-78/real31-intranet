import Link from "next/link";
import { Search, Bell } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

type TopbarProps = {
  user: { initiales: string; nomComplet: string };
  breadcrumb?: string;
};

export function Topbar({ user, breadcrumb }: TopbarProps) {
  return (
    <header className="flex items-center justify-between gap-4 px-4 h-12 shrink-0 border-b border-line bg-surface">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-6 h-6 rounded-[5px] flex items-center justify-center bg-green-700 text-white font-mono text-[10px] font-semibold">
          R31
        </div>
        <span className="text-[12.5px] font-medium">REAL31</span>
        {breadcrumb && (
          <>
            <span className="text-ink-4">/</span>
            <span className="text-[12.5px] text-ink-2 truncate">{breadcrumb}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="hidden md:flex items-center gap-2 w-[260px] h-7 px-2.5 rounded-md border border-line bg-surface focus-within:border-green-500 focus-within:ring-[3px] focus-within:ring-green-50">
          <Search strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 shrink-0" />
          <input
            aria-label="Rechercher"
            placeholder="Rechercher une copro, un copropriétaire..."
            className="flex-1 min-w-0 bg-transparent outline-none text-[13px] placeholder:text-ink-4"
          />
          <span className="font-mono text-[10px] px-1 py-0.5 rounded text-ink-3 bg-surface-3">⌘K</span>
        </label>
        <button
          type="button"
          aria-label="Notifications"
          className="relative inline-flex items-center justify-center w-7 h-7 rounded-md text-ink-2 hover:bg-surface-2 transition-colors duration-75"
        >
          <Bell strokeWidth={1.5} className="w-3.5 h-3.5" />
          <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-err-500" />
        </button>
        <Link
          href="/dev-login"
          title={`${user.nomComplet} - changer de gestionnaire`}
          className="rounded-full"
        >
          <Avatar initiales={user.initiales} title={user.nomComplet} />
        </Link>
      </div>
    </header>
  );
}
