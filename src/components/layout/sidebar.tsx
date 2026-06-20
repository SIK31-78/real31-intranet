import type { ComponentType } from "react";
import Link from "next/link";
import {
  LayoutDashboard, ListChecks, Inbox, Calendar, Building2, Library, Calculator, KeyRound,
  FileSignature, ShieldAlert, AppWindow, Key, Signature, Globe, Vote, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/cn";

export type NavKey =
  | "dashboard"
  | "evenements"
  | "emails"
  | "calendrier"
  | "copros"
  | "resolutions"
  | "compta"
  | "coffre"
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
  { key: "evenements", label: "Actions", href: "/mes-evenements", icon: ListChecks },
  { key: "emails", label: "Mes événements", href: "/mes-emails", icon: Inbox },
  { key: "calendrier", label: "Calendrier AG/CS", href: "/calendrier", icon: Calendar },
  { key: "copros", label: "Toutes les copropriétés", href: "/copropriete", icon: Building2 },
  { key: "resolutions", label: "Résolutions", href: "/resolutions", icon: Library },
  { key: "compta", label: "Pôle compta", href: "/compta", icon: Calculator },
  { key: "coffre", label: "Coffre-fort", href: "/coffre", icon: KeyRound },
];

type LienApp = { label: string; href: string; icon: ComponentType<{ className?: string; strokeWidth?: number }> };

// Applications REAL31 (les notres, s'ouvrent dans un nouvel onglet).
const APPS_EXTERNES: LienApp[] = [
  { label: "Registre des mandats", href: "https://mandats.real31.app/", icon: FileSignature },
  { label: "Sinistres", href: "https://sinistres.real31.app/", icon: ShieldAlert },
  {
    label: "Reality",
    href: "https://apps.powerapps.com/play/e/default-b025af61-5fb4-43b5-9892-5a82865e7686/a/1b4ec6f7-8172-4ccd-a63b-1fca272acb1d?tenantId=b025af61-5fb4-43b5-9892-5a82865e7686",
    icon: AppWindow,
  },
  {
    label: "Gestion des clés",
    href: "https://apps.powerapps.com/play/e/default-b025af61-5fb4-43b5-9892-5a82865e7686/a/87a42a4c-89cb-4e40-a579-5ce9b51d5a89?tenantId=b025af61-5fb4-43b5-9892-5a82865e7686",
    icon: Key,
  },
];

// Outils externes (tiers) qu'on utilise mais qui ne sont pas a nous.
const OUTILS_EXTERNES: LienApp[] = [
  { label: "OneSpan Sign", href: "https://apps.esignlive.eu/login", icon: Signature },
  { label: "Extranet Crypto", href: "https://real31.crypto-extranet.com/syndic", icon: Globe },
  { label: "AG Connect", href: "https://ag-connect.fr/fr/participants/sign_in", icon: Vote },
];

function NavItem({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors duration-75",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1",
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
    </Link>
  );
}

function LienExterne({
  label,
  href,
  icon: Icon,
}: {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "group flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-ink hover:bg-surface-2 transition-colors duration-75",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1",
      )}
    >
      <Icon strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0 text-ink-3" />
      <span className="truncate">{label}</span>
      <ExternalLink strokeWidth={1.5} className="ml-auto w-3 h-3 shrink-0 text-ink-4 group-hover:text-ink-3" />
    </a>
  );
}

function SectionTitre({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{children}</div>
  );
}

export function Sidebar({ active }: { active: NavKey }) {
  return (
    <aside className="shrink-0 w-[216px] border-r border-line bg-surface overflow-y-auto">
      <nav className="px-3 py-3">
        <SectionTitre>Mon travail</SectionTitre>
        {TRAVAIL.map((item) => (
          <NavItem key={item.key} item={item} active={item.key === active} />
        ))}

        <div className="mt-4 pt-3 border-t border-line">
          <SectionTitre>Nos applications</SectionTitre>
          {APPS_EXTERNES.map((app) => (
            <LienExterne key={app.label} {...app} />
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-line">
          <SectionTitre>Outils externes</SectionTitre>
          {OUTILS_EXTERNES.map((app) => (
            <LienExterne key={app.label} {...app} />
          ))}
        </div>
      </nav>
    </aside>
  );
}
