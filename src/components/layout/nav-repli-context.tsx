"use client";

// Etat "sidebar repliee" du module courant. La preference vit dans un COOKIE
// (cf. lib/domain/nav-repli), ce qui change tout par rapport a la version localStorage
// du 2026-08-20 : le SERVEUR la lit et rend d'emblee le bon etat. Ici, plus de store
// externe ni de lecture au montage -- juste un etat local initialise par le serveur, et
// une ecriture de cookie quand l'utilisateur bascule.
//
// Le provider est monte avec `key={module}` (cf. AppShell) : changer de module remonte
// le composant, donc l'etat initial du nouveau module est bien pris en compte.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { COOKIE_NAV_REPLI, MAX_AGE_NAV_REPLI, fusionnerRepli } from "@/lib/domain/nav-repli";

type NavRepliState = {
  /** Repli du module courant (n'a d'effet visuel qu'a partir de md:). */
  repli: boolean;
  basculer: () => void;
};

const NavRepliContext = createContext<NavRepliState | null>(null);

function ecrireCookie(module: string, repli: boolean): void {
  const brut = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAV_REPLI}=`));
  const existant = brut ? decodeURIComponent(brut.slice(COOKIE_NAV_REPLI.length + 1)) : "";
  // La FUSION (ne pas effacer la preference des autres modules) est la partie qui peut
  // se tromper : elle vit dans le domaine, ou elle est testee.
  const valeur = encodeURIComponent(fusionnerRepli(existant, module, repli));
  document.cookie = `${COOKIE_NAV_REPLI}=${valeur}; path=/; max-age=${MAX_AGE_NAV_REPLI}; samesite=lax`;
}

export function NavRepliProvider({
  module,
  repliInitial,
  children,
}: {
  module: string;
  /** Calcule par le serveur depuis le cookie : le premier rendu est deja le bon. */
  repliInitial: boolean;
  children: ReactNode;
}) {
  const [repli, setRepli] = useState(repliInitial);

  // L'ecriture du cookie est un EFFET DE BORD : elle ne doit pas vivre dans le
  // calculateur passe a setRepli (React peut l'appeler plusieurs fois, et le rendre
  // impur casse la mise a jour). On calcule d'abord, on pose l'etat, puis on ecrit.
  const basculer = useCallback(() => {
    const suivant = !repli;
    setRepli(suivant);
    ecrireCookie(module, suivant);
  }, [module, repli]);

  const valeur = useMemo(() => ({ repli, basculer }), [repli, basculer]);

  return <NavRepliContext.Provider value={valeur}>{children}</NavRepliContext.Provider>;
}

export function useNavRepli(): NavRepliState {
  const ctx = useContext(NavRepliContext);
  if (!ctx) throw new Error("useNavRepli doit etre utilise a l'interieur de NavRepliProvider");
  return ctx;
}
