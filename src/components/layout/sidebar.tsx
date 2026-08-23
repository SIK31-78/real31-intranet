"use client";

// Client component depuis le repli (2026-08-20) : la sidebar lit l'etat replie/deplie
// du contexte. Elle ne recoit que des props serialisables (cf. AppShell).

import type { ComponentType } from "react";
import Link from "next/link";
import {
  LayoutDashboard, Home, Inbox, Calendar, Building2, Calculator, KeyRound,
  ShieldAlert, Key, PackagePlus, Receipt, ClipboardList, Landmark, Sparkles,
  MessageSquare, Megaphone, FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useNavRepli } from "@/components/layout/nav-repli-context";

export type NavKey =
  | "accueil"
  | "evenements"
  | "emails"
  | "calendrier"
  | "copros"
  | "dossiers"
  | "reprise"
  | "resolutions"
  | "compta"
  | "facturation"
  | "gestion-courante"
  | "recap-ag"
  // File des recaps RECUS (espace comptable, /comptabilite/recaps). Distincte de
  // "recap-ag" qui est l'ecran de SAISIE du gestionnaire (/recap-ag) : meme sujet,
  // deux metiers et deux destinations.
  | "recaps-recus"
  | "coffre"
  | "equipe"
  | "toutes-copros"
  | "sinistres"
  | "nouveautes"
  | "cles-api"
  | "feedback"
  | "annonces"
  // Ecrans "atterrissage" sans entree de menu propre (ODJ, Supervision AG) : ne
  // surligne AUCUNE entree (avant, ils empruntaient "calendrier" a tort). Pas de
  // nouvelle entree sidebar - juste une valeur qui ne matche aucun item.
  | "aucun";

type Item = {
  key: NavKey;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  count?: number;
  /** Page pas encore ouverte : grisee, non cliquable, badge "a venir". */
  aVenir?: boolean;
};

// Navigation groupee par usage (reorg 2026-07-23, demande Sekou "manque de logique") :
//   Vue d'ensemble = pilotage (ou j'en suis) · A traiter = worklists/modules a actionner ·
//   Facturation = produire documents/argent · Ressources = outils transverses.
// "Reprise" grisee "a venir" ; "Comptabilite" et "Gestion courante" visibles pole compta only.
const GROUPES: { titre: string; items: Item[] }[] = [
  {
    titre: "Vue d'ensemble",
    items: [
      // Accueil = LA home (AG + dossiers en cours + en-tete, annonces, points signales).
      // Le "Dashboard" a ete demantele (Sekou 2026-07-22) : plus d'entree, /dashboard redirige.
      { key: "accueil", label: "Accueil", href: "/accueil", icon: Home },
      { key: "copros", label: "Toutes les copropriétés", href: "/copropriete", icon: Building2 },
      { key: "calendrier", label: "Calendrier AG/CS", href: "/calendrier", icon: Calendar },
    ],
  },
  {
    titre: "À traiter",
    items: [
      // Les dossiers etaient atteignables SEULEMENT depuis l'accueil : la page /dossiers
      // existait (avec sa vue detaillee) mais aucun lien de menu n'y menait, et la NavKey
      // "dossiers" etait declaree sans etre utilisee par aucune entree.
      { key: "dossiers", label: "Dossiers", href: "/dossiers", icon: FolderOpen },
      { key: "emails", label: "Mes e-mails", href: "/mes-emails", icon: Inbox },
      { key: "sinistres", label: "Sinistres", href: "/sinistre", icon: ShieldAlert },
      { key: "reprise", label: "Reprise de copropriété", href: "/reprise-copro", icon: PackagePlus, aVenir: true },
    ],
  },
  {
    titre: "Facturation",
    items: [
      { key: "facturation", label: "Facturation", href: "/facturation", icon: Receipt },
      { key: "recap-ag", label: "Récap AG", href: "/recap-ag", icon: ClipboardList },
      { key: "gestion-courante", label: "Gestion courante", href: "/gestion-courante", icon: Landmark },
      { key: "compta", label: "Comptabilité", href: "/comptabilite", icon: Calculator },
    ],
  },
  {
    titre: "Ressources",
    items: [
      { key: "coffre", label: "Coffre-fort", href: "/coffre", icon: KeyRound },
      { key: "nouveautes", label: "Nouveautés", href: "/nouveautes", icon: Sparkles },
    ],
  },
];

// Vue COMPTABLE epuree : la nav principale (3 groupes) est REMPLACEE par ces 3 entrees.
// Le "Dashboard" pointe sur /comptabilite (c'est SON dashboard) et porte la key "compta"
// pour etre surligne quand on est sur /comptabilite (active="compta").
const NAV_COMPTABLE: Item[] = [
  { key: "compta", label: "Dashboard", href: "/comptabilite", icon: LayoutDashboard },
  { key: "copros", label: "Toutes les copropriétés", href: "/copropriete", icon: Building2 },
  // Recap AG : la file des recaps RECUS (2026-08-17). Le comptable y lit la note de
  // travail du gestionnaire -- budget vote, fonds travaux, appels de fonds, nouveau
  // contrat. Elle existait sans lien de menu : il fallait taper l'URL.
  { key: "recaps-recus", label: "Récap AG", href: "/comptabilite/recaps", icon: ClipboardList },
  // Facturation : ajoutee le 2026-07-29. Un comptable facture sur les agences qu'il tient
  // (cf. domain/perimetre-comptable) -- la page marchait deja pour lui, mais aucun lien n'y
  // menait depuis sa nav reduite : il devait taper l'URL a la main.
  { key: "facturation", label: "Facturation", href: "/facturation", icon: Receipt },
  { key: "gestion-courante", label: "Gestion courante", href: "/gestion-courante", icon: Landmark },
  { key: "coffre", label: "Coffre-fort", href: "/coffre", icon: KeyRound },
  { key: "nouveautes", label: "Nouveautés", href: "/nouveautes", icon: Sparkles },
];

// Administration (visible SUPER-ADMIN seulement, cf. AppShell adminOuvert) : le panneau
// des cles API machine (auth de /api/v1 + MCP). Groupe separe pour ne pas noyer la nav.
const GROUPE_ADMIN: { titre: string; items: Item[] } = {
  titre: "Administration",
  items: [
    { key: "annonces", label: "Annonces", href: "/admin/annonces", icon: Megaphone },
    { key: "feedback", label: "Feedback", href: "/admin/feedback", icon: MessageSquare },
    { key: "cles-api", label: "Clés API", href: "/admin/cles-api", icon: Key },
  ],
};

// Repli : le libelle disparait A PARTIR DE md: seulement. Sous md: la sidebar est un
// tiroir (SidebarDrawer) ou replier n'a aucun sens - elle y reste toujours depliee.
const CACHE_SI_REPLI = "md:hidden";

function NavItem({ item, active, repli }: { item: Item; active: boolean; repli: boolean }) {
  const Icon = item.icon;

  if (item.aVenir) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-ink-4 cursor-not-allowed select-none",
          repli && "md:justify-center md:px-0",
        )}
        title={repli ? `${item.label} - bientôt disponible` : "Bientôt disponible"}
      >
        <Icon strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0 text-ink-4" />
        <span className={cn("truncate", repli && CACHE_SI_REPLI)}>{item.label}</span>
        <span
          className={cn(
            "ml-auto text-[9.5px] font-medium uppercase tracking-wide text-ink-4 border border-line rounded px-1 py-px",
            repli && CACHE_SI_REPLI,
          )}
        >
          à venir
        </span>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      // Replie, l'icone seule doit rester identifiable : le libelle passe en infobulle.
      title={repli ? item.label : undefined}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors duration-75",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1",
        active ? "bg-green-50 text-green-700 font-medium" : "text-ink hover:bg-surface-2",
        repli && "md:justify-center md:px-0",
      )}
    >
      <Icon strokeWidth={1.5} className={cn("w-3.5 h-3.5 shrink-0", active ? "text-green-700" : "text-ink-3")} />
      <span className={cn("truncate", repli && CACHE_SI_REPLI)}>{item.label}</span>
      {item.count !== undefined && (
        <span
          className={cn(
            "ml-auto font-mono text-[11px]",
            active ? "text-green-700" : "text-ink-3",
            repli && CACHE_SI_REPLI,
          )}
        >
          {item.count}
        </span>
      )}
    </Link>
  );
}

function SectionTitre({ repli, children }: { repli: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "px-2 mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3",
        repli && CACHE_SI_REPLI,
      )}
    >
      {children}
    </div>
  );
}

// Replie, les titres de groupe disparaissent : un filet les remplace pour que les
// groupes restent lisibles a l'icone.
function Groupe({ repli, premier, children }: { repli: boolean; premier: boolean; children: React.ReactNode }) {
  return <div className={cn(repli && !premier && "md:border-t md:border-line md:pt-2")}>{children}</div>;
}

export function Sidebar({
  active,
  emailsOuvert = true,
  comptaOuvert = false,
  vueComptable = false,
  adminOuvert = false,
}: {
  active: NavKey;
  emailsOuvert?: boolean;
  comptaOuvert?: boolean;
  /** Vue comptable epuree : remplace la nav principale par NAV_COMPTABLE (dashboard compta + copros + coffre). */
  vueComptable?: boolean;
  /** Groupe "Administration" (cles API) : visible SUPER-ADMIN seulement. */
  adminOuvert?: boolean;
}) {
  const { repli } = useNavRepli();

  return (
    <aside
      className={cn(
        // Toujours 216px sous md: (tiroir) ; des md: la largeur suit le repli.
        "shrink-0 w-[216px] border-r border-line bg-surface overflow-y-auto shadow-xl md:shadow-none",
        repli ? "md:w-14" : "md:w-[216px]",
      )}
    >
      <nav className={cn("py-3 flex flex-col gap-4", repli ? "px-2 md:px-1.5" : "px-3")}>
        {vueComptable ? (
          // Comptable pur : nav reduite. Pas de titre de groupe (une seule liste courte).
          <div>
            {NAV_COMPTABLE.map((item) => (
              <NavItem key={item.key} item={item} active={item.key === active} repli={repli} />
            ))}
          </div>
        ) : (
          GROUPES.map((groupe, i) => (
            <Groupe key={groupe.titre} repli={repli} premier={i === 0}>
              <SectionTitre repli={repli}>{groupe.titre}</SectionTitre>
              {groupe.items.map((item) => {
                // "Comptabilite" (dashboard transverse) et "Gestion courante" (page
                // reservee au pole compta) : liens ABSENTS hors role comptable / super-admin
                // (le pole compta est transverse, pas un gestionnaire).
                if ((item.key === "compta" || item.key === "gestion-courante") && !comptaOuvert)
                  return null;
                // "Mes evenements" grise "a venir" tant que la boite n'est pas branchee.
                const it = item.key === "emails" && !emailsOuvert ? { ...item, aVenir: true } : item;
                return <NavItem key={it.key} item={it} active={it.key === active} repli={repli} />;
              })}
            </Groupe>
          ))
        )}

        {adminOuvert && (
          <Groupe repli={repli} premier={false}>
            <SectionTitre repli={repli}>{GROUPE_ADMIN.titre}</SectionTitre>
            {GROUPE_ADMIN.items.map((item) => (
              <NavItem key={item.key} item={item} active={item.key === active} repli={repli} />
            ))}
          </Groupe>
        )}

        {/* "Nos applications" et "Outils externes" ont quitte la sidebar (2026-08-20) :
            ils sont dans le lanceur en damier de la topbar (cf. lanceur-apps.tsx). */}
      </nav>
    </aside>
  );
}
