import type { ComponentType } from "react";
import { LayoutDashboard, Inbox, Calendar, Building2, Users, Archive, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

export type NavKey =
  | "dashboard"
  | "evenements"
  | "calendrier"
  | "copros"
  | "equipe"
  | "toutes-copros"
  | "sinistres";

type Item = {
  key: NavKey;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  count?: number;
};

const TRAVAIL: Item[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "evenements", label: "Mes événements", href: "#", icon: Inbox, count: 12 },
  { key: "calendrier", label: "Calendrier AG/CS", href: "/calendrier", icon: Calendar },
  { key: "copros", label: "Mes copropriétés", href: "/copropriete", icon: Building2 },
];

const CABINET: Item[] = [
  { key: "equipe", label: "Équipe", href: "#", icon: Users },
  { key: "toutes-copros", label: "Toutes les copropriétés", href: "#", icon: Archive },
  { key: "sinistres", label: "Sinistres", href: "#", icon: AlertTriangle, count: 2 },
];

function NavItem({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <a
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors duration-75",
        active ? "bg-green-50 text-green-700 font-medium" : "text-ink hover:bg-surface-2",
      )}
    >
      <Icon strokeWidth={1.5} className={cn("w-3.5 h-3.5 shrink-0", active ? "text-green-700" : "text-ink-3")} />
      <span className="truncate">{item.label}</span>
      {item.count !== undefined && (
        <span className={cn("ml-auto font-mono text-[11px]", active ? "text-green-700" : "text-ink-3")}>
          {item.count}
        </span>
      )}
    </a>
  );
}

export function Sidebar({ active }: { active: NavKey }) {
  return (
    <aside className="shrink-0 w-[216px] border-r border-line bg-surface">
      <nav className="px-3 py-3">
        <div className="px-2 mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Mon travail</div>
        {TRAVAIL.map((item) => (
          <NavItem key={item.key} item={item} active={item.key === active} />
        ))}

        <div className="px-2 mt-4 mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Cabinet</div>
        {CABINET.map((item) => (
          <NavItem key={item.key} item={item} active={item.key === active} />
        ))}
      </nav>
    </aside>
  );
}
