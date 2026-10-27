"use client";

// La boîte triée affichée (V2 du tri, 27/10/2026) : chaque action du tri la renvoie au
// serveur, qui la revérifie (c'est bien la boîte de la personne, ou un super-admin). Un
// contexte plutôt qu'une propriété descendue dans chaque bloc de l'écran.

import { createContext, useContext, type ReactNode } from "react";

const BoiteTri = createContext<string>("");

export function BoiteTriProvider({ boite, children }: { boite: string; children: ReactNode }) {
  return <BoiteTri.Provider value={boite}>{children}</BoiteTri.Provider>;
}

/** L'adresse de la boîte triée affichée ("echantillon" en développement). */
export function useBoiteTri(): string {
  return useContext(BoiteTri);
}
