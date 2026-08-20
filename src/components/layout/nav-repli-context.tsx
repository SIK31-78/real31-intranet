"use client";

// Etat "sidebar repliee" MEMORISE PAR MODULE (option C, decision Sekou 2026-08-20).
// Pourquoi par module et pas global : replier pour donner de l'air a la page mail ne
// doit pas priver les autres pages de leurs libelles (14 entrees a deviner a l'icone).
// Regle : le mail s'ouvre replie la premiere fois, tout le reste s'ouvre deplie ; ensuite
// le choix de l'utilisateur gagne, et ne vaut que pour le module ou il l'a fait.
//
// La preference vit dans localStorage, donc HORS de React : on la lit avec
// useSyncExternalStore (et non un useState + useEffect, qui declencherait un rendu en
// cascade). C'est aussi ce qui rend l'hydratation propre : le serveur rend le defaut,
// le client bascule sur la preference reelle juste apres.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const CLE = "real31.nav.repli";

/** Modules qui s'ouvrent replies par defaut (tant que l'utilisateur n'a rien choisi). */
const REPLI_PAR_DEFAUT = new Set<string>(["emails"]);

type NavRepliState = {
  /** Repli effectif du module courant (n'a d'effet visuel qu'a partir de md:). */
  repli: boolean;
  basculer: () => void;
};

const NavRepliContext = createContext<NavRepliState | null>(null);

// --- Petit store externe autour de localStorage -----------------------------------

const abonnes = new Set<() => void>();
let cache: Record<string, boolean> | null = null;

function lire(): Record<string, boolean> {
  if (cache) return cache;
  try {
    const brut = window.localStorage.getItem(CLE);
    const val: unknown = brut ? JSON.parse(brut) : null;
    cache = val && typeof val === "object" ? (val as Record<string, boolean>) : {};
  } catch {
    // localStorage indisponible (navigation privee, quota) : on degrade sur le defaut.
    cache = {};
  }
  return cache;
}

function ecrire(prefs: Record<string, boolean>): void {
  cache = prefs;
  try {
    window.localStorage.setItem(CLE, JSON.stringify(prefs));
  } catch {
    /* preference non persistee : sans consequence sur la session en cours */
  }
  for (const notifier of abonnes) notifier();
}

function souscrire(notifier: () => void): () => void {
  abonnes.add(notifier);
  // `storage` = la preference a change dans un AUTRE onglet : on invalide et on suit.
  const surStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== CLE) return;
    cache = null;
    notifier();
  };
  window.addEventListener("storage", surStorage);
  return () => {
    abonnes.delete(notifier);
    window.removeEventListener("storage", surStorage);
  };
}

// ---------------------------------------------------------------------------------

export function NavRepliProvider({ module, children }: { module: string; children: ReactNode }) {
  const defaut = REPLI_PAR_DEFAUT.has(module);

  const snapshot = useCallback(() => lire()[module] ?? defaut, [module, defaut]);
  // Rendu serveur (et premiere passe d'hydratation) : le defaut, jamais localStorage.
  const snapshotServeur = useCallback(() => defaut, [defaut]);
  const repli = useSyncExternalStore(souscrire, snapshot, snapshotServeur);

  const basculer = useCallback(() => {
    const prefs = lire();
    ecrire({ ...prefs, [module]: !(prefs[module] ?? defaut) });
  }, [module, defaut]);

  const valeur = useMemo(() => ({ repli, basculer }), [repli, basculer]);

  return <NavRepliContext.Provider value={valeur}>{children}</NavRepliContext.Provider>;
}

export function useNavRepli(): NavRepliState {
  const ctx = useContext(NavRepliContext);
  if (!ctx) throw new Error("useNavRepli doit etre utilise a l'interieur de NavRepliProvider");
  return ctx;
}
