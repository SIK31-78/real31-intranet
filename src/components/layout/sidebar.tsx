import type { ComponentType } from "react";
import Link from "next/link";
import {
  LayoutDashboard, ListChecks, Inbox, Calendar, Building2, Library, Calculator, KeyRound,
  FolderOpen, FileSignature, ShieldAlert, AppWindow, Key, Signature, Globe, Vote, Database, ExternalLink,
  PackagePlus, Receipt,
} from "lucide-react";
import { cn } from "@/lib/cn";

export type NavKey =
  | "dashboard"
  | "evenements"
  | "emails"
  | "calendrier"
  | "copros"
  | "dossiers"
  | "reprise"
  | "resolutions"
  | "compta"
  | "facturation"
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
  /** Page pas encore ouverte : grisee, non cliquable, badge "a venir". */
  aVenir?: boolean;
};

// Navigation groupee par usage : Vue d'ensemble (pilotage) / A traiter (worklists) /
// Ressources (outils transverses). Resolutions et Comptabilite sont "a venir".
const GROUPES: { titre: string; items: Item[] }[] = [
  {
    titre: "Vue d'ensemble",
    items: [
      { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { key: "copros", label: "Toutes les copropriétés", href: "/copropriete", icon: Building2 },
      { key: "dossiers", label: "Dossiers", href: "/dossiers", icon: FolderOpen },
      { key: "sinistres", label: "Sinistres", href: "/sinistre", icon: ShieldAlert },
      { key: "reprise", label: "Reprise de copropriété", href: "/reprise-copro", icon: PackagePlus, aVenir: true },
      { key: "calendrier", label: "Calendrier AG/CS", href: "/calendrier", icon: Calendar },
    ],
  },
  {
    titre: "À traiter",
    items: [
      { key: "evenements", label: "Actions", href: "/mes-evenements", icon: ListChecks },
      { key: "emails", label: "Mes événements", href: "/mes-emails", icon: Inbox },
    ],
  },
  {
    titre: "Ressources",
    items: [
      { key: "resolutions", label: "Résolutions", href: "/resolutions", icon: Library, aVenir: true },
      { key: "compta", label: "Comptabilité", href: "/comptabilite", icon: Calculator },
      { key: "facturation", label: "Facturation", href: "/facturation", icon: Receipt },
      { key: "coffre", label: "Coffre-fort", href: "/coffre", icon: KeyRound },
    ],
  },
];

// Vue COMPTABLE epuree : la nav principale (3 groupes) est REMPLACEE par ces 3 entrees.
// Le "Dashboard" pointe sur /comptabilite (c'est SON dashboard) et porte la key "compta"
// pour etre surligne quand on est sur /comptabilite (active="compta").
const NAV_COMPTABLE: Item[] = [
  { key: "compta", label: "Dashboard", href: "/comptabilite", icon: LayoutDashboard },
  { key: "copros", label: "Toutes les copropriétés", href: "/copropriete", icon: Building2 },
  { key: "coffre", label: "Coffre-fort", href: "/coffre", icon: KeyRound },
];

type LienApp = { label: string; href: string; icon: ComponentType<{ className?: string; strokeWidth?: number }> };

// Applications REAL31 (les notres, s'ouvrent dans un nouvel onglet).
const APPS_EXTERNES: LienApp[] = [
  { label: "Registre des mandats", href: "https://mandats.real31.app/", icon: FileSignature },
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
  { label: "Estale", href: "https://estale.app/auth/signin", icon: Database },
  { label: "OneSpan Sign", href: "https://apps.esignlive.eu/login", icon: Signature },
  { label: "Extranet Crypto", href: "https://real31.crypto-extranet.com/syndic", icon: Globe },
  { label: "AG Connect", href: "https://ag-connect.fr/fr/participants/sign_in", icon: Vote },
];

function NavItem({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;

  if (item.aVenir) {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-ink-4 cursor-not-allowed select-none"
        title="Bientôt disponible"
      >
        <Icon strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0 text-ink-4" />
        <span className="truncate">{item.label}</span>
        <span className="ml-auto text-[9.5px] font-medium uppercase tracking-wide text-ink-4 border border-line rounded px-1 py-px">
          à venir
        </span>
      </div>
    );
  }

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

export function Sidebar({
  active,
  emailsOuvert = true,
  comptaOuvert = false,
  vueComptable = false,
}: {
  active: NavKey;
  emailsOuvert?: boolean;
  comptaOuvert?: boolean;
  /** Vue comptable epuree : remplace la nav principale par NAV_COMPTABLE (dashboard compta + copros + coffre). */
  vueComptable?: boolean;
}) {
  return (
    <aside className="shrink-0 w-[216px] border-r border-line bg-surface overflow-y-auto">
      <nav className="px-3 py-3 flex flex-col gap-4">
        {vueComptable ? (
          // Comptable pur : nav reduite. Pas de titre de groupe (une seule liste courte).
          <div>
            {NAV_COMPTABLE.map((item) => (
              <NavItem key={item.key} item={item} active={item.key === active} />
            ))}
          </div>
        ) : (
          GROUPES.map((groupe) => (
            <div key={groupe.titre}>
              <SectionTitre>{groupe.titre}</SectionTitre>
              {groupe.items.map((item) => {
                // "Comptabilite" (dashboard transverse) : lien ABSENT hors role comptable /
                // super-admin (le pole compta est transverse, pas un gestionnaire).
                if (item.key === "compta" && !comptaOuvert) return null;
                // "Mes evenements" grise "a venir" tant que la boite n'est pas branchee.
                const it = item.key === "emails" && !emailsOuvert ? { ...item, aVenir: true } : item;
                return <NavItem key={it.key} item={it} active={it.key === active} />;
              })}
            </div>
          ))
        )}

        <div className="pt-3 border-t border-line">
          <SectionTitre>Nos applications</SectionTitre>
          {APPS_EXTERNES.map((app) => (
            <LienExterne key={app.label} {...app} />
          ))}
        </div>

        <div className="pt-3 border-t border-line">
          <SectionTitre>Outils externes</SectionTitre>
          {OUTILS_EXTERNES.map((app) => (
            <LienExterne key={app.label} {...app} />
          ))}
        </div>
      </nav>
    </aside>
  );
}
