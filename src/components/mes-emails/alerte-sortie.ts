"use client";

// Garde-fou de l'onglet (REA-408) : tant qu'un mail est en cours d'écriture (réponse,
// nouveau mail, transfert), fermer ou recharger l'onglet fait demander confirmation au
// navigateur. Ne couvre pas la navigation interne de l'intranet (liens du menu).

import { useEffect } from "react";

export function useAlerteSortie(actif: boolean) {
  useEffect(() => {
    if (!actif) return;
    const garde = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", garde);
    return () => window.removeEventListener("beforeunload", garde);
  }, [actif]);
}
