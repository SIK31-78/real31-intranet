"use client";

// Etat partage (ouvert/ferme) du tiroir de navigation mobile. Le bouton hamburger
// vit dans la Topbar, le tiroir lui-meme enveloppe la Sidebar (server component) :
// les deux ont besoin du meme etat sans etre dans le meme sous-arbre React direct,
// d'ou ce contexte pose une fois par AppShell.

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type MobileSidebarState = {
  ouvert: boolean;
  basculer: () => void;
  fermer: () => void;
};

const MobileSidebarContext = createContext<MobileSidebarState | null>(null);

export function MobileSidebarProvider({ children }: { children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  const basculer = useCallback(() => setOuvert((v) => !v), []);
  const fermer = useCallback(() => setOuvert(false), []);

  return (
    <MobileSidebarContext.Provider value={{ ouvert, basculer, fermer }}>{children}</MobileSidebarContext.Provider>
  );
}

export function useMobileSidebar(): MobileSidebarState {
  const ctx = useContext(MobileSidebarContext);
  if (!ctx) throw new Error("useMobileSidebar doit etre utilise a l'interieur de MobileSidebarProvider");
  return ctx;
}
