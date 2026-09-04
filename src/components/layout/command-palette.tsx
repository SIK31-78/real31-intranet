"use client";

// Palette de commande (Cmd+K) : recherche de copro + navigation rapide. Remplace la
// fausse barre de recherche du topbar. Les copros sont chargees a l'ouverture (lazy,
// une fois). Dialog accessible.
//
// PERIMETRE : TOUT LE CABINET, plus le seul portefeuille (cf. recherche/actions et
// services/coproprietes/perimetre-lecture). Un resultat qui n'est pas une copro de
// l'utilisateur porte le nom de son gestionnaire : on doit savoir chez qui on regarde.
// Le filtre lui-meme vit dans le domaine (filtrerRecherche), teste offline.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, Building2, CornerDownLeft } from "lucide-react";
import { chargerCoprosRecherche } from "@/app/recherche/actions";
import { filtrerRecherche, type CoproRecherche } from "@/lib/domain/recherche-copro";

const NAV: { label: string; href: string }[] = [
  { label: "Accueil", href: "/accueil" },
  { label: "Mes e-mails", href: "/mes-emails" },
  { label: "Calendrier AG/CS", href: "/calendrier" },
  { label: "Toutes les copropriétés", href: "/copropriete" },
  { label: "Coffre-fort", href: "/coffre" },
];

interface Item {
  cle: string;
  titre: string;
  sous?: string;
  /** Gestionnaire de la copro, quand ce n'est pas une copro de l'utilisateur. */
  gestionnaire?: string;
  href: string;
  copro: boolean;
}

export function CommandPalette({ emailsOuvert = true }: { emailsOuvert?: boolean }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [query, setQuery] = useState("");
  const [copros, setCopros] = useState<CoproRecherche[] | null>(null);
  const [actif, setActif] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ouverture / fermeture par Cmd+K (ou Ctrl+K).
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOuvert((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A l'ouverture : focus + chargement lazy des copros (une seule fois).
  useEffect(() => {
    if (!ouvert) return;
    inputRef.current?.focus();
    if (copros === null) chargerCoprosRecherche().then(setCopros).catch(() => setCopros([]));
  }, [ouvert, copros]);

  const items: Item[] = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) {
      // "Mes evenements" (boite mail) reserve au pilote -> hors navigation si verrouille.
      const nav = emailsOuvert ? NAV : NAV.filter((n) => n.href !== "/mes-emails");
      return nav.map((n) => ({ cle: n.href, titre: n.label, href: n.href, copro: false }));
    }
    return filtrerRecherche(copros ?? [], q).map((c) => ({
      cle: c.code,
      titre: `${c.code} - ${c.nom}`,
      sous: c.ville,
      ...(c.gestionnaire ? { gestionnaire: c.gestionnaire } : {}),
      href: `/copropriete/${c.code}`,
      copro: true,
    }));
  }, [query, copros, emailsOuvert]);

  function fermer() {
    setOuvert(false);
    setQuery("");
  }
  function aller(href: string) {
    fermer();
    router.push(href);
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Escape") return fermer();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActif((i) => Math.min(i + 1, items.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActif((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const it = items[actif];
      if (it) aller(it.href);
    }
  }

  return (
    <>
      {/* Desktop : barre de recherche complete. */}
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-label="Rechercher (Ctrl+K)"
        className="hidden md:flex items-center gap-2 w-[260px] h-7 px-2.5 rounded-md border border-line bg-surface hover:border-line-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1"
      >
        <Search strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 shrink-0" />
        <span className="flex-1 text-left text-[13px] text-ink-4 truncate">Rechercher une copro...</span>
        <span className="font-mono text-[10px] px-1 py-0.5 rounded text-ink-3 bg-surface-3">Ctrl K</span>
      </button>

      {/* Mobile / une main : icone tactile (le raccourci clavier n'est pas atteignable). */}
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-label="Rechercher"
        className="flex md:hidden items-center justify-center w-7 h-7 rounded-md text-ink-2 hover:bg-surface-2 transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1"
      >
        <Search strokeWidth={1.5} className="w-3.5 h-3.5" />
      </button>

      {ouvert && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Recherche et navigation"
        >
          <div className="absolute inset-0 bg-black/30" onClick={fermer} />
          <div className="relative w-full max-w-[560px] rounded-lg border border-line bg-surface shadow-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 h-11 border-b border-line">
              <Search strokeWidth={1.5} className="w-4 h-4 text-ink-3 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActif(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Rechercher une copropriété du cabinet, naviguer..."
                aria-label="Rechercher"
                className="flex-1 bg-transparent outline-none text-[14px] text-ink placeholder:text-ink-4"
              />
              <kbd className="font-mono text-[10px] px-1 py-0.5 rounded text-ink-4 bg-surface-3">Esc</kbd>
            </div>
            <ul role="listbox" aria-label="Resultats" className="max-h-[320px] overflow-auto py-1">
              {items.length === 0 ? (
                <li className="px-3 py-6 text-[13px] text-ink-3 text-center">
                  {query && copros === null ? "Chargement..." : "Aucun resultat."}
                </li>
              ) : (
                items.map((it, i) => (
                  <li key={it.cle} role="option" aria-selected={i === actif}>
                    <button
                      type="button"
                      onMouseEnter={() => setActif(i)}
                      onClick={() => aller(it.href)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] ${
                        i === actif ? "bg-green-50 text-green-800" : "text-ink hover:bg-surface-2"
                      }`}
                    >
                      <Building2 strokeWidth={1.5} className={`w-3.5 h-3.5 shrink-0 ${it.copro ? "text-ink-3" : "text-ink-4"}`} />
                      <span className="flex-1 truncate">{it.titre}</span>
                      {it.sous && <span className="text-[11.5px] text-ink-4 truncate">{it.sous}</span>}
                      {/* Copro d'un(e) collegue : on dit chez qui on va regarder. Discret
                          (meme gris que la ville), mais toujours visible. */}
                      {it.gestionnaire && (
                        <span className="text-[11.5px] text-ink-4 truncate shrink-0" title={`Gérée par ${it.gestionnaire}`}>
                          · {it.gestionnaire}
                        </span>
                      )}
                      {i === actif && <CornerDownLeft strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4 shrink-0" />}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
