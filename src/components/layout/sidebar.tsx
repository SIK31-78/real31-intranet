import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import {
  BellRing, Bot, Briefcase, Gauge, Building2, Calculator, ChevronDown, ClipboardList, Database, Euro, ExternalLink, FileSignature, FolderOpen, Globe, Handshake, Home, Inbox, MailCheck, Key, KeyRound, Landmark, LayoutDashboard, Megaphone, MessageSquare, PackageMinus, PackagePlus, PhoneCall, Receipt, ShieldAlert, ShieldCheck, Signature, Sparkles, Users, Vote,
  FilePen,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { CommandPalette } from "@/components/layout/command-palette";
import { UserMenu } from "@/components/layout/user-menu";
import { PastilleEmails } from "@/components/mes-emails/chiffre-a-traiter";
import type { ChiffreATraiter } from "@/lib/domain/mes-emails-liste";

export type NavKey =
  | "accueil"
  | "evenements"
  | "emails"
  | "tri-emails"
  | "echanges"
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
  // Contrats & contrôles (REA-333) : assurance, gaz, CTQ ascenseur et VMC des copros,
  // reprend l'ancienne application « Contrats copro » qui n'est plus liée d'ici.
  | "contrats-copro"
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
  // Seuils de relance du module « Contrats & contrôles » (/admin/relances, REA-333).
  | "relances"
  | "collaborateurs"
  | "linkus"
  | "modeles-mail"
  | "feedback"
  | "annonces"
  // Gestion des cles (ADR-040) : le comptoir des trousseaux, remplace la canvas app PowerApps.
  | "cles"
  // Hub IA du groupe : un lien vers une autre application, pas un ecran de l'intranet.
  | "hub-ia"
  | "pilotage"
  // L'ERP des equipes vente, location et accueil (REA-346) : lien externe lui aussi.
  | "erp"
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
  /** Le compteur est une alerte (pastille rouge) : des choses attendent. */
  alerte?: boolean;
  /** Une pastille vivante à la place du compteur (« E-mails » : le chiffre unique, 29/10/2026). */
  pastille?: ReactNode;
  /** Page pas encore ouverte : grisee, non cliquable, badge "a venir". */
  aVenir?: boolean;
  /** Autre application : s'ouvre dans un nouvel onglet, jamais surlignee. */
  externe?: boolean;
};

// Navigation groupee par usage (reorg 2026-07-23, demande Sekou "manque de logique") :
//   Vue d'ensemble = pilotage (ou j'en suis) · A traiter = worklists/modules a actionner ·
//   Facturation = produire documents/argent · Ressources = outils transverses.
// "Comptabilite" visible pole compta only ; "Gestion courante" comptable d'entreprise + super-admin only.
const GROUPES: { titre: string; items: Item[] }[] = [
  {
    // Ce qu'on ouvre tous les jours. Le calendrier AG/CS n'a plus d'entree : il est en tete
    // de l'accueil (Sekou, 21/09/2026).
    titre: "Tous les jours",
    items: [
      { key: "accueil", label: "Accueil", href: "/accueil", icon: Home },
      { key: "copros", label: "Toutes les copropriétés", href: "/copropriete", icon: Building2 },
      { key: "dossiers", label: "Dossiers", href: "/dossiers", icon: FolderOpen },
      { key: "cles", label: "Gestion des clés", href: "/cles", icon: Key },
      { key: "emails", label: "E-mails", href: "/mes-emails", icon: Inbox },
      { key: "tri-emails", label: "Tri des e-mails", href: "/tri-emails", icon: MailCheck },
    ],
  },
  {
    // Le travail de gestion autour de l'AG et de la copro.
    titre: "Gestion",
    items: [
      { key: "recap-ag", label: "Récap AG", href: "/recap-ag", icon: ClipboardList },
      { key: "contrat", label: "Contrats de syndic", href: "/contrat", icon: FileSignature },
      { key: "contrats-copro", label: "Contrats & contrôles", href: "/contrats-copro", icon: ShieldCheck },
      { key: "sinistres", label: "Sinistres", href: "/sinistre", icon: ShieldAlert },
      { key: "facturation", label: "Facturation", href: "/facturation", icon: Receipt },
    ],
  },
  {
    // Ce que la direction pilote : chaque entree a sa propre condition, le groupe disparait
    // s'il est vide.
    titre: "Direction",
    items: [
      { key: "propositions", label: "Propositions de contrat", href: "/propositions", icon: Handshake },
      { key: "perte", label: "Perte de copropriété", href: "/perte-copro", icon: PackageMinus },
      { key: "reprise", label: "Reprise de copropriété", href: "/reprise-copro", icon: PackagePlus },
      { key: "gestion-courante", label: "Gestion courante", href: "/gestion-courante", icon: Landmark },
      { key: "compta", label: "Comptabilité", href: "/comptabilite", icon: Calculator },
      { key: "collaborateurs", label: "Collaborateurs", href: "/collaborateurs", icon: Users },
    ],
  },
  {
    titre: "Plus",
    items: [
      { key: "coffre", label: "Coffre-fort", href: "/coffre", icon: KeyRound },
      { key: "nouveautes", label: "Nouveautés", href: "/nouveautes", icon: Sparkles },
      // Le hub des outils d'IA du groupe (demande Sekou, 13/10/2026).
      // Pilotage : déclarer ses heures supplémentaires et piloter l'activité syndic (Sekou,
      // 29/10/2026). Pour tout le monde, comme le HUB IA.
      { key: "pilotage", label: "Pilotage", href: "https://pilotage.real31.app/", icon: Gauge, externe: true },
      { key: "hub-ia", label: "HUB IA", href: "https://ia.real31.app/", icon: Bot, externe: true },
    ],
  },
];

// Vue COMPTABLE epuree : la nav principale (3 groupes) est REMPLACEE par ces 3 entrees.
// Le "Dashboard" pointe sur /comptabilite (c'est SON dashboard) et porte la key "compta"
// pour etre surligne quand on est sur /comptabilite (active="compta").
const NAV_COMPTABLE: Item[] = [
  { key: "compta", label: "Dashboard", href: "/comptabilite", icon: LayoutDashboard },
  // E-mails (Sekou, 28/10/2026) : sa boîte perso et, en un seul onglet, le dossier
  // « Comptabilité » de toutes les boîtes triées. Filtrée par emailsComptable.
  { key: "emails", label: "E-mails", href: "/mes-emails", icon: Inbox },
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
  // Perte de copropriete : la fiche process a des etapes pour la comptable copro et la
  // comptable entreprise (dossier comptable a transmettre, cloture). La page et la coche
  // leur etaient deja ouvertes (repli comptable de coproAppartient), mais aucun lien n'y
  // menait depuis cette nav reduite (Isabelle, S224, 14/10/2026, REA-311).
  { key: "perte", label: "Perte de copropriété", href: "/perte-copro", icon: PackageMinus },
  // Reprise de copropriete : la comptable nommee dans l'equipe d'un dossier doit pouvoir
  // l'ouvrir (REA-353, 16/10/2026). Filtree par repriseOuverte ; la page ne liste que les
  // dossiers dont elle fait partie de l'equipe.
  { key: "reprise", label: "Reprise de copropriété", href: "/reprise-copro", icon: PackagePlus },
  { key: "coffre", label: "Coffre-fort", href: "/coffre", icon: KeyRound },
  { key: "nouveautes", label: "Nouveautés", href: "/nouveautes", icon: Sparkles },
  // Pilotage (heures supplémentaires, activité syndic) : pour tout le monde (Sekou, 29/10/2026).
  { key: "pilotage", label: "Pilotage", href: "https://pilotage.real31.app/", icon: Gauge, externe: true },
  // HUB IA pour tout le monde, comptables compris (Sekou, 23/10/2026).
  { key: "hub-ia", label: "HUB IA", href: "https://ia.real31.app/", icon: Bot, externe: true },
];

// Vue HORS SYNDIC (vente, location, accueil - roles AUTRE et GESTIONNAIRE_LOCATIVE de la
// table, Sekou 18/09/2026) : Neis n'a que faire des AG, des sinistres et de la facturation.
// Sa nav : le comptoir des cles, le coffre-fort et les nouveautes (les propositions de
// contrat sont reservees aux habilites depuis le 21/09). Les pages portent leurs gardes.
const NAV_HORS_SYNDIC: Item[] = [
  { key: "cles", label: "Gestion des clés", href: "/cles", icon: Key },
  // Gestion courante : la COMPTABLE DU CABINET (role AUTRE en base, elle n'est pas dans
  // le syndic) facture les honoraires trimestriels. La page lui etait deja ouverte, mais
  // sa nav reduite n'y menait pas : il fallait taper l'URL (Sekou 2026-10-01). Filtree
  // par gestionCouranteOuverte, donc invisible pour vente, location et accueil.
  { key: "gestion-courante", label: "Gestion courante", href: "/gestion-courante", icon: Landmark },
  { key: "coffre", label: "Coffre-fort", href: "/coffre", icon: KeyRound },
  { key: "nouveautes", label: "Nouveautés", href: "/nouveautes", icon: Sparkles },
  // L'ERP est l'outil quotidien de la vente, de la location et de
  // l'accueil : il leur manquait un accès depuis l'intranet (REA-346, 16/10/2026). Dans
  // cette nav et pas dans « Nos applications », que voit aussi le syndic qui ne s'en sert pas.
  { key: "erp", label: "ERP", href: "https://erp.real31.app", icon: Briefcase, externe: true },
  // Pilotage (heures supplémentaires, activité syndic) : pour tout le monde (Sekou, 29/10/2026).
  { key: "pilotage", label: "Pilotage", href: "https://pilotage.real31.app/", icon: Gauge, externe: true },
  // HUB IA pour tout le monde, vente, location et accueil compris (Sekou, 23/10/2026).
  { key: "hub-ia", label: "HUB IA", href: "https://ia.real31.app/", icon: Bot, externe: true },
];

// Administration (visible SUPER-ADMIN seulement, cf. AppShell adminOuvert) : le panneau
// des cles API machine (auth de /api/v1 + MCP). Groupe separe pour ne pas noyer la nav.
const GROUPE_ADMIN: { titre: string; items: Item[] } = {
  titre: "Administration",
  items: [
    { key: "annonces", label: "Annonces", href: "/admin/annonces", icon: Megaphone },
    { key: "feedback", label: "Feedback", href: "/admin/feedback", icon: MessageSquare },
    { key: "linkus", label: "Annuaire Linkus", href: "/admin/linkus", icon: PhoneCall },
    { key: "modeles-mail", label: "Modèles de mail", href: "/admin/modeles-mail", icon: FilePen },
    { key: "cles-api", label: "Clés API", href: "/admin/cles-api", icon: Key },
    { key: "tarifs", label: "Barème annuel", href: "/admin/tarifs", icon: Euro },
    { key: "relances", label: "Seuils de relance", href: "/admin/relances", icon: BellRing },
  ],
};

type LienApp = { label: string; href: string; icon: ComponentType<{ className?: string; strokeWidth?: number }> };

// Applications REAL31 (les notres, s'ouvrent dans un nouvel onglet).
const APPS_EXTERNES: LienApp[] = [
  { label: "Registre des mandats", href: "https://mandats.real31.app/", icon: FileSignature },
  // « Contrats copro » n'est plus listée ici : le suivi des contrats fournisseurs vit dans
  // l'intranet depuis le 16/10/2026 (entrée « Contrats & contrôles » du groupe Gestion, REA-333).
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

  if (item.externe) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "group flex items-center gap-2 px-2.5 h-8 rounded-md text-body font-medium text-rail-ink hover:bg-rail-2 transition-colors duration-120",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300",
        )}
      >
        <Icon strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0 text-rail-muted" />
        <span className="truncate">{item.label}</span>
        <ExternalLink strokeWidth={1.5} className="ml-auto w-3 h-3 shrink-0 text-rail-muted opacity-60 group-hover:opacity-100" />
      </a>
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
      {item.pastille ??
        (item.count !== undefined &&
        (item.alerte ? (
          <span
            className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-err-500 text-white text-meta font-semibold tabular-nums leading-[18px] text-center"
            aria-label={`${item.count} à traiter`}
          >
            {item.count > 99 ? "99+" : item.count}
          </span>
        ) : (
          <span className={cn("ml-auto text-meta tabular-nums rounded-full border px-1.5", active ? "text-green-700 border-green-200" : "text-rail-muted border-rail-line")}>
            {item.count}
          </span>
        )))}
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
  recapsEnRetard = null,
  comptaOuvert = false,
  gestionCouranteOuverte = false,
  repriseOuverte = false,
  vueComptable = false,
  vueHorsSyndic = false,
  adminOuvert = false,
  linkusOuvert = false,
  modelesMailOuvert = false,
  directionOuverte = false,
  propositionsOuvertes = false,
  perteOuverte = false,
  triOuvert = false,
  triATrier = null,
  emailsATraiter = null,
  echangesOuvert = false,
  emailsComptable = false,
}: {
  active: NavKey;
  user: { initiales: string; nomComplet: string };
  peutImpersonner?: boolean;
  emailsOuvert?: boolean;
  /** Recaps d'AG en retard du collaborateur (pastille rouge sur « Récap AG ») ; null = inconnu. */
  recapsEnRetard?: number | null;
  comptaOuvert?: boolean;
  /** Entree "Gestion courante" : comptable d'entreprise + super-admin seulement. */
  gestionCouranteOuverte?: boolean;
  /** Entree "Reprise de copropriete" : l'equipe syndic et le pole compta (chacun ne voit que ses dossiers). */
  repriseOuverte?: boolean;
  /** Vue comptable epuree : remplace la nav principale par NAV_COMPTABLE (dashboard compta + copros + coffre). */
  vueComptable?: boolean;
  /** Vue hors syndic (vente, location, accueil) : propositions, cles, coffre, nouveautes. */
  vueHorsSyndic?: boolean;
  /** Groupe "Administration" (cles API) : visible SUPER-ADMIN seulement. */
  adminOuvert?: boolean;
  /** Entree "Annuaire Linkus" : ADMIN de la table User + super-admin (seule entree du groupe Administration pour un non super-admin). */
  linkusOuvert?: boolean;
  /** Entree "Modèles de mail" : admins et responsables d'agence (REA-296). */
  modelesMailOuvert?: boolean;
  /** Entree "Collaborateurs" : direction (directeurs, referents, super-admin). */
  directionOuverte?: boolean;
  /** Entree "Propositions de contrat" : les habilites (Léa, Emmanuel, Sandy, Dimitri, Nicolas) et super-admin. */
  propositionsOuvertes?: boolean;
  /** Entree "Perte de copropriete" : la direction. */
  perteOuverte?: boolean;
  /** Entree "Tri des e-mails" : la personne a une boite triee (celle de son agence), ou super-admin. */
  triOuvert?: boolean;
  /** Mails dans la boite de reception generique (pastille rouge) ; null = inconnu. */
  triATrier?: number | null;
  /** Le chiffre unique « À traiter » de « E-mails » (29/10/2026) : neutre, rouge s'il y a du retard. */
  emailsATraiter?: ChiffreATraiter | null;
  /** Entree "Échanges" : l'agence de l'utilisateur a une boite commune configuree (Houilles d'abord), ou super-admin. */
  echangesOuvert?: boolean;
  /** Entree "E-mails" d'un comptable (role COMPTABLE, module actif) : le dossier « Comptabilité » des boites triees (28/10/2026). */
  emailsComptable?: boolean;
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
        <CommandPalette emailsOuvert={emailsOuvert} vueHorsSyndic={vueHorsSyndic} gestionCouranteOuverte={gestionCouranteOuverte} />
      </div>
      <nav className="px-3 py-4 flex flex-col gap-4 flex-1">
        {vueHorsSyndic ? (
          // Vente, location, accueil : nav courte, pas de titre de groupe.
          <div>
            {NAV_HORS_SYNDIC.filter((item) => item.key !== "gestion-courante" || gestionCouranteOuverte).map(
              (item) => (
                <NavItem key={item.key} item={item} active={item.key === active} />
              ),
            )}
          </div>
        ) : vueComptable ? (
          // Comptable pur : nav reduite. Pas de titre de groupe (une seule liste courte).
          <div>
            {NAV_COMPTABLE.filter(
              (item) =>
                (item.key !== "gestion-courante" || gestionCouranteOuverte) &&
                (item.key !== "reprise" || repriseOuverte) &&
                (item.key !== "emails" || emailsComptable),
            ).map((item) => (
              <NavItem
                key={item.key}
                item={item.key === "emails" ? { ...item, pastille: <PastilleEmails initial={emailsATraiter} /> } : item}
                active={item.key === active}
              />
            ))}
          </div>
        ) : (
          GROUPES.map((groupe) => {
            const visibles = groupe.items.filter((item) => {
              // "Comptabilite" (dashboard transverse) : pole compta / super-admin.
              if (item.key === "compta") return comptaOuvert;
              // "Gestion courante" : comptable d'ENTREPRISE et super-admin (Sekou 2026-09-14).
              if (item.key === "gestion-courante") return gestionCouranteOuverte;
              // "Mes e-mails" : A VENIR pour les collegues -> super-admins seulement.
              // « E-mails » (boîte + recherche dans tous les échanges, ex-écran Échanges, 13/10/2026) :
              // les admins, et les agences qui ont une boîte commune configurée.
              // Un comptable l'a aussi, pour le dossier « Comptabilité » (28/10/2026).
              if (item.key === "emails") return adminOuvert || echangesOuvert || emailsComptable;
              // "Reprise" : ouverte aux gestionnaires depuis le 08/10/2026, au pole compta
              // depuis le 16/10/2026 (REA-353). Chacun n'y voit que les reprises dont il fait
              // partie de l'equipe (cf. dossierVisiblePar), la direction voit tout.
              if (item.key === "reprise") return repriseOuverte;
              // "Tri des e-mails" (ADR-046) : l'agence de la boite et les super-admins (cf. AppShell).
              if (item.key === "tri-emails") return triOuvert;
              // "Collaborateurs" et "Perte" : la direction.
              if (item.key === "collaborateurs") return directionOuverte;
              if (item.key === "perte") return perteOuverte;
              // "Propositions" : les habilites (Sekou, 21/09/2026).
              if (item.key === "propositions") return propositionsOuvertes;
              return true;
            });
            if (visibles.length === 0) return null;
            return (
              <div key={groupe.titre}>
                <SectionTitre>{groupe.titre}</SectionTitre>
                {visibles.map((item) => {
                  // "Mes evenements" grise "a venir" tant que la boite n'est pas branchee.
                  // "Récap AG" : pastille rouge des recaps en retard (rien si 0 ou inconnu).
                  const it =
                    item.key === "emails" && !emailsOuvert
                      ? { ...item, aVenir: true }
                      : item.key === "emails"
                        ? { ...item, pastille: <PastilleEmails initial={emailsATraiter} /> }
                      : item.key === "tri-emails" && triATrier
                        ? { ...item, count: triATrier, alerte: true }
                        : item.key === "recap-ag" && recapsEnRetard
                          ? { ...item, count: recapsEnRetard, alerte: true }
                        : item;
                  return <NavItem key={it.key} item={it} active={it.key === active} />;
                })}
              </div>
            );
          })
        )}

        {(adminOuvert || linkusOuvert || modelesMailOuvert) && (
          <div>
            <SectionTitre>{GROUPE_ADMIN.titre}</SectionTitre>
            {GROUPE_ADMIN.items
              .filter((item) => adminOuvert || (item.key === "linkus" && linkusOuvert) || (item.key === "modeles-mail" && modelesMailOuvert))
              .map((item) => (
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
