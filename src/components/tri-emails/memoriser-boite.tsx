"use client";

import { useEffect } from "react";
import { COOKIE_DERNIERE_BOITE_TRI } from "./derniere-boite";

const UN_AN_SECONDES = 31_536_000;

/**
 * Retient la boite affichee pour la prochaine ouverture du tri. Cookie (et pas localStorage)
 * pour que le serveur la connaisse des le premier rendu, comme la preference du calendrier.
 * La page revalide toujours la valeur contre les boites autorisees : le cookie ne donne aucun droit.
 */
export function MemoriserBoite({ boite }: { boite: string }) {
  useEffect(() => {
    try {
      document.cookie = `${COOKIE_DERNIERE_BOITE_TRI}=${encodeURIComponent(boite)}; path=/; max-age=${UN_AN_SECONDES}; SameSite=Lax`;
    } catch {
      // Cookies refuses : sans consequence, la boite par defaut s'applique.
    }
  }, [boite]);
  return null;
}
