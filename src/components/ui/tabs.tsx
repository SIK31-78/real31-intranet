"use client";

import type { ReactNode } from "react";
import { ExternalLink, Lock } from "lucide-react";
import { cn } from "@/lib/cn";

// Onglets accessibles (pattern Tabs WAI-ARIA) : l'ETAT reste chez l'appelant, ces
// composants ne font que dessiner. Extraits de fiche-copro-vue (la version la plus
// complete) pour que les 13 reimplementations convergent.

export function TabList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="tablist" aria-label={label} className="flex items-center gap-1 border-b border-line overflow-x-auto">
      {children}
    </div>
  );
}

const TAB =
  "inline-flex items-center gap-1.5 px-3 h-9 text-body -mb-px border-b-2 whitespace-nowrap transition-colors duration-120 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset";

export function Tab({
  id,
  panelId,
  active,
  onClick,
  count,
  children,
}: {
  id: string;
  panelId: string;
  active: boolean;
  onClick: () => void;
  count?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={panelId}
      aria-selected={active}
      onClick={onClick}
      className={cn(TAB, active ? "border-green-700 text-ink font-medium" : "border-transparent text-ink-2 hover:text-ink")}
    >
      {children}
      {count !== undefined && <span className="text-meta text-ink-2 tabular-nums">{count}</span>}
    </button>
  );
}

/** Onglet-lien vers une app externe (nouvel onglet). */
export function TabLink({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      role="tab"
      title={title}
      className={cn(TAB, "border-transparent text-ink-2 hover:text-ink")}
    >
      {children}
      <ExternalLink strokeWidth={1.5} className="w-3 h-3 text-ink-3" aria-hidden="true" />
    </a>
  );
}

/** Onglet verrouille (module a venir) : reste dans le tablist, annonce aux lecteurs d'ecran. */
export function TabVerrouille({ title, children }: { title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      disabled
      aria-disabled="true"
      aria-selected={false}
      title={title}
      className={cn(TAB, "border-transparent text-ink-3 cursor-not-allowed")}
    >
      <Lock strokeWidth={1.5} className="w-3 h-3" aria-hidden="true" />
      {children}
      <span className="sr-only">(non disponible)</span>
    </button>
  );
}

export function TabPanel({ id, tabId, children }: { id: string; tabId: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={id} aria-labelledby={tabId} tabIndex={0} className="animate-fade-in focus:outline-none">
      {children}
    </div>
  );
}
