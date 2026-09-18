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
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, Building2, CornerDownLeft, ArrowRight } from "lucide-react";
import { chargerCoprosRecherche } from "@/app/recherche/actions";
import { filtrerRecherche, type CoproRecherche } from "@/lib/domain/recherche-copro";

const NAV: { label: string; href: string }[] = [
  { label: "Accueil", href: "/accueil" },
  { label: "Mes e-mails", href: "/mes-emails" },
  { label: "Calendrier AG/CS", href: "/calendrier" },
  { label: "Toutes les copropriétés", href: "/copropriete" },
  { label: "Coffre-fort", href: "/coffre" },
];

// Hors syndic (vente, location, accueil) : les memes entrees que leur rail.
const NAV_HORS_SYNDIC: { label: string; href: string }[] = [
  { label: "Propositions de contrat", href: "/propositions" },
  { label: "Gestion des clés", href: "/cles" },
  { label: "Coffre-fort", href: "/coffre" },
  { label: "Nouveautés", href: "/nouveautes" },
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

type Variante = "rail" | "rail-icone";

export function CommandPalette({
  emailsOuvert = true,
  vueHorsSyndic = false,
  variante = "rail",
}: {
  emailsOuvert?: boolean;
  /** Vente, location, accueil : la navigation reduite du rail. */
  vueHorsSyndic?: boolean;
  /** rail = pilule de recherche dans le rail ; rail-icone = icone seule (barre mobile). */
  variante?: Variante;
}) {
  // Une seule instance ecoute Ctrl+K : celle du rail. La barre mobile (display:none
  // des md) a la sienne, qui ne repond qu'au clic - sinon deux dialogues s'ouvraient.
  const ecouteRaccourci = variante === "rail";
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [query, setQuery] = useState("");
  const [copros, setCopros] = useState<CoproRecherche[] | null>(null);
  const [actif, setActif] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ouverture / fermeture par Cmd+K (ou Ctrl+K).
  useEffect(() => {
    if (!ecouteRaccourci) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOuvert((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ecouteRaccourci]);

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
      const nav = vueHorsSyndic ? NAV_HORS_SYNDIC : emailsOuvert ? NAV : NAV.filter((n) => n.href !== "/mes-emails");
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
  }, [query, copros, emailsOuvert, vueHorsSyndic]);

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
      {variante === "rail" ? (
        // Rail : pilule de recherche (comme la maquette), Ctrl+K rappele.
        <button
          type="button"
          onClick={() => setOuvert(true)}
          aria-label="Rechercher (Ctrl+K)"
          className="w-full flex items-center gap-2 h-9 pl-3 pr-2 rounded-full border border-rail-line bg-rail-2 text-rail-muted hover:bg-white/10 hover:border-rail-muted/40 transition-colors duration-120 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300"
        >
          <Search strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" aria-hidden />
          {/* "Recherche" et rien d'autre (Sekou, 2026-09-11). Le rail fait 240 px : entre
              l'icone, le raccourci et les marges, il reste ~110 px, et "Rechercher une
              copro…" y arrivait tronque - donc illisible ET plus long que necessaire. Ce
              qu'on peut chercher est dit dans le champ, une fois la palette ouverte. */}
          <span className="flex-1 text-left text-body truncate">Recherche</span>
          <kbd className="font-mono text-meta px-1.5 py-0.5 rounded-sm border border-rail-line bg-black/20 text-rail-muted">Ctrl K</kbd>
        </button>
      ) : (
        // Barre mobile : icone seule (le raccourci clavier n'est pas atteignable).
        <button
          type="button"
          onClick={() => setOuvert(true)}
          aria-label="Rechercher"
          className="flex items-center justify-center w-8 h-8 rounded-md text-rail-ink hover:bg-rail-2 transition-colors duration-120 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300"
        >
          <Search strokeWidth={1.5} className="w-4 h-4" aria-hidden />
        </button>
      )}

      {/* Le dialogue est PORTE dans <body> : le rail est `sticky`, donc un contexte
          d'empilement a lui - rendu dedans, le dialogue passait SOUS les champs de la
          page (la barre de recherche des copros s'affichait par-dessus la palette). */}
      {ouvert && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[15vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Recherche et navigation"
        >
          <div className="absolute inset-0 bg-rail/50 animate-fade-in" onClick={fermer} />
          <div className="relative w-full max-w-[560px] rounded-xl border border-line bg-surface shadow-2 overflow-hidden animate-scale-in">
            <div className="flex items-center gap-2 px-3 h-12 border-b border-line">
              <Search strokeWidth={1.5} className="w-4 h-4 text-ink-3 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActif(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Rechercher une copropriété du cabinet, naviguer…"
                aria-label="Rechercher"
                className="flex-1 h-full bg-transparent text-body text-ink placeholder:text-ink-3 outline-none"
              />
              <kbd className="font-mono text-meta px-1 py-0.5 rounded-sm text-ink-3 bg-surface-3">Esc</kbd>
            </div>
            <ul role="listbox" aria-label="Resultats" className="max-h-[320px] overflow-auto py-1">
              {items.length === 0 ? (
                <li className="px-3 py-6 text-body text-ink-3 text-center">
                  {query && copros === null ? "Chargement…" : "Aucun résultat"}
                </li>
              ) : (
                items.map((it, i) => (
                  <li key={it.cle} role="option" aria-selected={i === actif}>
                    <button
                      type="button"
                      onMouseEnter={() => setActif(i)}
                      onClick={() => aller(it.href)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-body ${
 i === actif ? "bg-green-50 text-green-700" : "text-ink hover:bg-surface-2"
                      }`}
                    >
                      {it.copro ? (
                        <Building2 strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0 text-ink-3" aria-hidden />
                      ) : (
                        <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0 text-ink-3" aria-hidden />
                      )}
                      <span className="flex-1 truncate">{it.titre}</span>
                      {it.sous && <span className="text-meta text-ink-3 truncate">{it.sous}</span>}
                      {/* Copro d'un(e) collegue : on dit chez qui on va regarder. Discret
                          (meme gris que la ville), mais toujours visible. */}
                      {it.gestionnaire && (
                        <span className="text-meta text-ink-3 truncate shrink-0" title={`Gérée par ${it.gestionnaire}`}>
                          · {it.gestionnaire}
                        </span>
                      )}
                      {i === actif && <CornerDownLeft strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 shrink-0" />}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
