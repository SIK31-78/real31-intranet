import type { ComponentType } from "react";
import Link from "next/link";
import {
  LayoutDashboard, Home, Inbox, Calendar, Building2, Calculator, KeyRound,
  FileSignature, ShieldAlert, Key, Signature, Globe, Vote, Database, ExternalLink,
  PackagePlus,
  PackageMinus, Handshake, Receipt, ClipboardList, Landmark, Sparkles, MessageSquare, Megaphone,
  FolderOpen, ChevronDown, Euro, Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { CommandPalette } from "@/components/layout/command-palette";
import { UserMenu } from "@/components/layout/user-menu";

export type NavKey =
  | "accueil"
  | "evenements"
  | "emails"
  | "calendrier"
  | "copros"
  | "dossiers"
  | "reprise"
  | "perte"
  | "propositions"
  | "resolutions"
  | "compta"
  | "facturation"
  | "gestion-courante"
  | "recap-ag"
  | "contrat"
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
  | "tarifs"
  | "collaborateurs"
  | "points-estale"
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
// "Comptabilite" visible pole compta only ; "Gestion courante" comptable d'entreprise + super-admin only.
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
      { key: "reprise", label: "Reprise de copropriété", href: "/reprise-copro", icon: PackagePlus },
      // Le miroir de la reprise : ce qu'il reste a faire quand une AG nomme un autre syndic.
      { key: "perte", label: "Perte de copropriété", href: "/perte-copro", icon: PackageMinus },
      // Le debut de la chaine : ce qui pourrait devenir une copro geree (ADR-039).
      { key: "propositions", label: "Propositions de contrat", href: "/propositions", icon: Handshake },
    ],
  },
  {
    titre: "Facturation",
    items: [
      { key: "facturation", label: "Facturation", href: "/facturation", icon: Receipt },
      { key: "recap-ag", label: "Récap AG", href: "/recap-ag", icon: ClipboardList },
      // Le contrat de syndic vit ICI et pas dans "Vue d'ensemble" : ce qu'on y regle
      // (honoraires, forfait timbres, bareme des prestations) est de la facturation,
      // et c'est l'AG qui ouvre chaque nouveau cycle de contrat.
      { key: "contrat", label: "Contrats de syndic", href: "/contrat", icon: FileSignature },
      { key: "gestion-courante", label: "Gestion courante", href: "/gestion-courante", icon: Landmark },
      { key: "compta", label: "Comptabilité", href: "/comptabilite", icon: Calculator },
    ],
  },
  {
    titre: "Ressources",
    items: [
      { key: "coffre", label: "Coffre-fort", href: "/coffre", icon: KeyRound },
      // Collaborateurs (16/09/2026) : qui est la, sur quel portefeuille. DIRECTION seulement.
      { key: "collaborateurs", label: "Collaborateurs", href: "/collaborateurs", icon: Users },
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
    { key: "points-estale", label: "Points ESTALE", href: "/admin/estale", icon: Database },
    { key: "cles-api", label: "Clés API", href: "/admin/cles-api", icon: Key },
    { key: "tarifs", label: "Barème annuel", href: "/admin/tarifs", icon: Euro },
  ],
};

type LienApp = { label: string; href: string; icon: ComponentType<{ className?: string; strokeWidth?: number }> };

// Applications REAL31 (les notres, s'ouvrent dans un nouvel onglet).
const APPS_EXTERNES: LienApp[] = [
  { label: "Registre des mandats", href: "https://mandats.real31.app/", icon: FileSignature },
  {
    label: "Gestion des clés",
    href: "https://apps.powerapps.com/play/e/default-b025af61-5fb4-43b5-9892-5a82865e7686/a/87a42a4c-89cb-4e40-a579-5ce9b51d5a89?tenantId=b025af61-5fb4-43b5-9892-5a82865e7686",
    icon: Key,
  },
];

// Outils externes (tiers) qu'on utilise mais qui ne sont pas a nous.
const OUTILS_EXTERNES: LienApp[] = [
  { label: "ESTALE", href: "https://estale.app/auth/signin", icon: Database },
  { label: "OneSpan Sign", href: "https://apps.esignlive.eu/login", icon: Signature },
  { label: "Extranet Crypto", href: "https://real31.crypto-extranet.com/syndic", icon: Globe },
  { label: "AG Connect", href: "https://ag-connect.fr/fr/participants/sign_in", icon: Vote },
];

function NavItem({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;

  if (item.aVenir) {
    return (
      <div
        className="flex items-center gap-2 px-2.5 h-8 rounded-md text-body text-rail-muted cursor-not-allowed select-none"
        title="Bientôt disponible"
      >
        <Icon strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{item.label}</span>
        <span className="ml-auto text-meta font-medium uppercase tracking-[0.06em] border border-rail-line rounded-full px-1.5">
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
        "flex items-center gap-2 px-2.5 h-8 rounded-md text-body font-medium transition-colors duration-120",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300",
        active ? "bg-surface-2 text-green-900 font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,.55)]" : "text-rail-ink hover:bg-rail-2",
      )}
    >
      <Icon strokeWidth={1.5} className={cn("w-3.5 h-3.5 shrink-0", active ? "text-green-700" : "text-rail-muted")} />
      <span className="truncate">{item.label}</span>
      {item.count !== undefined && (
        <span className={cn("ml-auto text-meta tabular-nums rounded-full border px-1.5", active ? "text-green-700 border-green-200" : "text-rail-muted border-rail-line")}>
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
        "group flex items-center gap-2 px-2.5 h-8 rounded-md text-body text-rail-ink hover:bg-rail-2 transition-colors duration-120",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300",
      )}
    >
      <Icon strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0 text-rail-muted" />
      <span className="truncate">{label}</span>
      <ExternalLink strokeWidth={1.5} className="ml-auto w-3 h-3 shrink-0 text-rail-muted opacity-60 group-hover:opacity-100" />
    </a>
  );
}

function SectionTitre({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 mb-1.5 text-meta font-semibold uppercase tracking-[0.12em] text-rail-muted">{children}</div>
  );
}

/**
 * Groupe repliable du pied de rail. « Nos applications » est deplie a l'ouverture, « Outils
 * externes » replie (Sekou 2026-09-14 : le rail ne doit pas s'allonger avec des liens tiers).
 */
function GroupeReplie({ titre, children, ouvert = true }: { titre: string; children: React.ReactNode; ouvert?: boolean }) {
  return (
    <details open={ouvert} className="group pt-3 border-t border-rail-line">
      <summary className="flex items-center px-2.5 mb-1.5 cursor-pointer select-none list-none text-meta font-semibold uppercase tracking-[0.12em] text-rail-muted [&::-webkit-details-marker]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300 rounded-sm">
        {titre}
        <ChevronDown strokeWidth={1.5} className="ml-auto w-3.5 h-3.5 transition-transform duration-180 ease-out-quart group-open:rotate-180" aria-hidden />
      </summary>
      {children}
    </details>
  );
}

export function Sidebar({
  active,
  user,
  peutImpersonner = false,
  emailsOuvert = true,
  comptaOuvert = false,
  gestionCouranteOuverte = false,
  vueComptable = false,
  adminOuvert = false,
  directionOuverte = false,
}: {
  active: NavKey;
  user: { initiales: string; nomComplet: string };
  peutImpersonner?: boolean;
  emailsOuvert?: boolean;
  comptaOuvert?: boolean;
  /** Entree "Gestion courante" : comptable d'entreprise + super-admin seulement. */
  gestionCouranteOuverte?: boolean;
  /** Vue comptable epuree : remplace la nav principale par NAV_COMPTABLE (dashboard compta + copros + coffre). */
  vueComptable?: boolean;
  /** Groupe "Administration" (cles API) : visible SUPER-ADMIN seulement. */
  adminOuvert?: boolean;
  /** Entree "Collaborateurs" : direction (directeurs, referents, super-admin). */
  directionOuverte?: boolean;
}) {
  return (
    <aside className="shrink-0 w-full md:w-60 md:sticky md:top-0 md:h-screen bg-rail text-rail-ink overflow-y-auto defilement-discret flex flex-col shadow-2 md:shadow-none">
      {/* Marque + recherche (ex-topbar), en tete du rail. */}
      <div className="hidden md:flex items-center gap-2.5 px-4 pt-5 pb-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.png" alt="" className="w-8 h-8 rounded-md object-contain shrink-0" />
        <div className="min-w-0 text-body font-semibold leading-tight truncate">
          REAL31 <span className="text-rail-muted font-medium">· Intranet</span>
        </div>
      </div>
      <div className="hidden md:block px-3 pt-3">
        <CommandPalette emailsOuvert={emailsOuvert} />
      </div>
      <nav className="px-3 py-4 flex flex-col gap-4 flex-1">
        {vueComptable ? (
          // Comptable pur : nav reduite. Pas de titre de groupe (une seule liste courte).
          <div>
            {NAV_COMPTABLE.filter((item) => item.key !== "gestion-courante" || gestionCouranteOuverte).map((item) => (
              <NavItem key={item.key} item={item} active={item.key === active} />
            ))}
          </div>
        ) : (
          GROUPES.map((groupe) => (
            <div key={groupe.titre}>
              <SectionTitre>{groupe.titre}</SectionTitre>
              {groupe.items.map((item) => {
                // "Comptabilite" (dashboard transverse) : lien ABSENT hors pole compta / super-admin.
                if (item.key === "compta" && !comptaOuvert) return null;
                // "Gestion courante" (facturation des honoraires du cabinet) : comptable
                // d'ENTREPRISE et super-admin seulement (Sekou 2026-09-14).
                if (item.key === "gestion-courante" && !gestionCouranteOuverte) return null;
                // "Mes e-mails" et "Reprise de copropriete" : fonctionnalites A VENIR pour les
                // collegues (Sekou 2026-09-10) -> visibles des SUPER-ADMINS seulement.
                if ((item.key === "emails" || item.key === "reprise") && !adminOuvert) return null;
                // "Collaborateurs" : la direction (roles table, referents, super-admin).
                if (item.key === "collaborateurs" && !directionOuverte) return null;
                // "Mes evenements" grise "a venir" tant que la boite n'est pas branchee.
                const it = item.key === "emails" && !emailsOuvert ? { ...item, aVenir: true } : item;
                return <NavItem key={it.key} item={it} active={it.key === active} />;
              })}
            </div>
          ))
        )}

        {adminOuvert && (
          <div>
            <SectionTitre>{GROUPE_ADMIN.titre}</SectionTitre>
            {GROUPE_ADMIN.items.map((item) => (
              <NavItem key={item.key} item={item} active={item.key === active} />
            ))}
          </div>
        )}

        <GroupeReplie titre="Nos applications">
          {APPS_EXTERNES.map((app) => (
            <LienExterne key={app.label} {...app} />
          ))}
        </GroupeReplie>

        <GroupeReplie titre="Outils externes" ouvert={false}>
          {OUTILS_EXTERNES.map((app) => (
            <LienExterne key={app.label} {...app} />
          ))}
        </GroupeReplie>
      </nav>
      {/* Utilisateur en pied (ex-topbar). */}
      <div className="px-3 pb-3 pt-2 border-t border-rail-line">
        <UserMenu user={user} peutImpersonner={peutImpersonner} />
      </div>
    </aside>
  );
}
