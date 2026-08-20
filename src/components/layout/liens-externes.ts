import type { ComponentType } from "react";
import { FileSignature, Key, Database, Signature, Globe, Vote } from "lucide-react";

// Liens vers les applications hors intranet. Ils vivaient dans la sidebar, ou ils
// occupaient pres d'un tiers de la hauteur pour des liens ouverts quelques fois par
// jour ; ils sont desormais dans le lanceur de la topbar (cf. lanceur-apps.tsx).
// Module de donnees pur (pas de "use client") : importable des deux cotes.

export type LienApp = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
};

/** Nos applications (REAL31), s'ouvrent dans un nouvel onglet. */
export const APPS_REAL31: LienApp[] = [
  { label: "Registre des mandats", href: "https://mandats.real31.app/", icon: FileSignature },
  {
    label: "Gestion des clés",
    href: "https://apps.powerapps.com/play/e/default-b025af61-5fb4-43b5-9892-5a82865e7686/a/87a42a4c-89cb-4e40-a579-5ce9b51d5a89?tenantId=b025af61-5fb4-43b5-9892-5a82865e7686",
    icon: Key,
  },
];

/** Outils tiers qu'on utilise mais qui ne sont pas a nous. */
export const OUTILS_TIERS: LienApp[] = [
  { label: "Estale", href: "https://estale.app/auth/signin", icon: Database },
  { label: "OneSpan Sign", href: "https://apps.esignlive.eu/login", icon: Signature },
  { label: "Extranet Crypto", href: "https://real31.crypto-extranet.com/syndic", icon: Globe },
  { label: "AG Connect", href: "https://ag-connect.fr/fr/participants/sign_in", icon: Vote },
];

/** Domaine affiche sous le nom dans le lanceur : factuel, deduit de l'URL. */
export function domaineDe(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
