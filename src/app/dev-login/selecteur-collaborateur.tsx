"use client";

// Le selecteur d'impersonation : 48 personnes, il faut TAPER pour trouver (Sekou, 21/09/2026 :
// « trop long pour trouver quelqu'un »). Une barre de recherche prend le focus a l'ouverture
// et sur Ctrl+K ; elle filtre sur le nom, le prenom, le role et l'agence. Fleches et Entree
// choisissent, un clic aussi. Des filtres rapides par famille de role.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { choisirGestionnaire } from "./actions";

export interface CollaborateurIncarnable {
  id: string;
  nomComplet: string;
  initiales: string;
  /** Libelle FR du role (« Gestionnaire », « Assistant »…). */
  role: string | null;
  /** Code brut du role (GESTIONNAIRE, ASSISTANT, ADMIN…), pour les filtres. */
  roleBrut: string | null;
  agence: string | null;
  superAdmin: boolean;
}

const FAMILLES: { cle: string; label: string; roles: string[] }[] = [
  { cle: "tous", label: "Tous", roles: [] },
  { cle: "syndic", label: "Syndic", roles: ["GESTIONNAIRE", "ASSISTANT"] },
  { cle: "direction", label: "Direction", roles: ["ADMIN", "DIRECTEUR_SYNDIC", "DIRECTEUR_AGENCE"] },
  { cle: "compta", label: "Compta", roles: ["COMPTABLE"] },
  { cle: "autres", label: "Vente, location, autres", roles: ["AUTRE", "GESTIONNAIRE_LOCATIVE", "CONSEILLER_VENTE"] },
];

function normaliser(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function SelecteurCollaborateur({ collaborateurs }: { collaborateurs: CollaborateurIncarnable[] }) {
  const [query, setQuery] = useState("");
  const [famille, setFamille] = useState("tous");
  const [actif, setActif] = useState(0);
  const [pending, demarrer] = useTransition();
  const [choisi, setChoisi] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visibles = useMemo(() => {
    const roles = FAMILLES.find((f) => f.cle === famille)?.roles ?? [];
    const mots = normaliser(query).split(/\s+/).filter(Boolean);
    return collaborateurs.filter((c) => {
      if (roles.length > 0 && !roles.includes((c.roleBrut ?? "").toUpperCase())) return false;
      if (mots.length === 0) return true;
      const corpus = normaliser([c.nomComplet, c.role ?? "", c.agence ?? "", c.superAdmin ? "super-admin" : ""].join(" "));
      return mots.every((m) => corpus.includes(m));
    });
  }, [collaborateurs, famille, query]);

  function choisir(id: string) {
    setChoisi(id);
    demarrer(() => choisirGestionnaire(id));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActif((i) => Math.min(i + 1, visibles.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActif((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && visibles[actif]) {
      e.preventDefault();
      choisir(visibles[actif].id);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" aria-hidden />
        <Input
          ref={inputRef}
          type="search"
          aria-label="Rechercher un collaborateur"
          placeholder="Nom, rôle ou agence…  (Ctrl K)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActif(0);
          }}
          onKeyDown={onKeyDown}
          className="pl-8"
          autoComplete="off"
        />
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Famille de rôle">
        {FAMILLES.map((f) => (
          <button
            key={f.cle}
            type="button"
            onClick={() => {
              setFamille(f.cle);
              setActif(0);
            }}
            className={cn(
              "h-7 px-2.5 rounded-sm border text-body transition-colors",
              famille === f.cle ? "bg-green-50 border-green-200 text-green-800 font-medium" : "bg-surface border-line text-ink-2 hover:bg-surface-2",
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto self-center text-meta text-ink-3 tabular-nums">{visibles.length} / {collaborateurs.length}</span>
      </div>
      <ul className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto defilement-discret -mx-1 px-1" role="listbox" aria-label="Collaborateurs">
        {visibles.length === 0 && <li className="text-body text-ink-3 px-2 py-4 text-center">Personne ne correspond.</li>}
        {visibles.map((c, i) => (
          <li key={c.id} role="option" aria-selected={i === actif}>
            <button
              type="button"
              onClick={() => choisir(c.id)}
              onMouseEnter={() => setActif(i)}
              disabled={pending}
              className={cn(
                "w-full flex items-center gap-3 h-11 px-2.5 rounded-md border text-left transition-colors",
                i === actif ? "bg-surface-2 border-line-2" : "bg-surface border-transparent hover:bg-surface-2",
              )}
            >
              <span className="w-8 h-8 rounded-full bg-surface-2 text-ink-2 text-body font-medium flex items-center justify-center shrink-0">
                {choisi === c.id && pending ? <Loader2 strokeWidth={1.5} className="w-4 h-4 animate-spin" /> : c.initiales}
              </span>
              <span className="text-body text-ink truncate">{c.nomComplet}</span>
              <span className="ml-auto flex items-center gap-1.5 shrink-0">
                {c.role && <span className="text-meta font-medium uppercase tracking-wide text-ink-3 border border-line rounded-sm px-1.5 py-px">{c.role}</span>}
                {c.agence && <span className="text-meta font-medium uppercase tracking-wide text-ink-3 border border-line rounded-sm px-1.5 py-px">{c.agence}</span>}
                {c.superAdmin && <span className="text-meta font-medium uppercase tracking-wide text-green-700 border border-green-700/40 rounded-sm px-1.5 py-px">super-admin</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
