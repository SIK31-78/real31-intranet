"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, ExternalLink } from "lucide-react";
import { APPS_REAL31, OUTILS_TIERS, domaineDe, type LienApp } from "@/components/layout/liens-externes";

// Lanceur d'applications (icone en damier de la topbar) : nos applications + les
// outils tiers, sortis de la sidebar ou ils mangeaient la hauteur pour quelques
// clics par jour. Meme mecanique de popover que UserMenu (clic exterieur + Echap).

function Tuile({ lien, onNavigue }: { lien: LienApp; onNavigue: () => void }) {
  const Icon = lien.icon;
  return (
    <a
      href={lien.href}
      target="_blank"
      rel="noreferrer"
      onClick={onNavigue}
      className="group flex items-start gap-2 rounded-md px-2 py-2 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
    >
      <Icon strokeWidth={1.5} className="w-4 h-4 mt-px shrink-0 text-ink-3" />
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-[12.5px] text-ink">
          <span className="truncate">{lien.label}</span>
          <ExternalLink strokeWidth={1.5} className="w-3 h-3 shrink-0 text-ink-4 group-hover:text-ink-3" />
        </span>
        <span className="block truncate text-[10.5px] text-ink-4">{domaineDe(lien.href)}</span>
      </span>
    </a>
  );
}

export function LanceurApps() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Applications et outils"
        title="Applications et outils"
        className="flex items-center justify-center w-7 h-7 rounded-md border border-line bg-surface text-ink-3 hover:bg-surface-2 hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1"
      >
        <LayoutGrid strokeWidth={1.5} className="w-3.5 h-3.5" />
      </button>

      {open && (
        <>
          {/* clic exterieur pour fermer */}
          <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label="Applications et outils"
            className="absolute right-0 mt-2 w-[290px] z-20 rounded-md border border-line bg-surface shadow-1 p-1.5"
          >
            <p className="px-2 pt-1 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">
              Nos applications
            </p>
            {APPS_REAL31.map((lien) => (
              <Tuile key={lien.label} lien={lien} onNavigue={() => setOpen(false)} />
            ))}
            <p className="px-2 pt-2.5 pb-1 mt-1 border-t border-line text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">
              Outils externes
            </p>
            {OUTILS_TIERS.map((lien) => (
              <Tuile key={lien.label} lien={lien} onNavigue={() => setOpen(false)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
