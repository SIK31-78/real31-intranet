"use client";

// Recherche d'une copro par l'adresse e-mail d'un client (03/11/2026) : quand la recherche
// ressemble à une adresse (« dupont@… »), on demande au serveur les copros de cette adresse,
// une fois la frappe posée. Les adresses ne vont jamais au navigateur. Partagé par le tri et
// « Pas pour moi ».

import { useEffect, useState } from "react";
import type { Res } from "@/lib/actions/resultat";
import { debutEmailRecherche, type TrouveeParEmail } from "@/lib/domain/recherche-copro-tolerante";

const DELAI_MS = 300;

/**
 * Les copros trouvées par l'adresse pour la recherche EN COURS ; [] sinon, ou en attendant.
 * `chercher` doit être stable (useCallback sur la boîte) : elle relance la recherche.
 */
export function useCoprosParEmail(recherche: string, chercher: (debut: string) => Promise<Res<TrouveeParEmail[]>>): TrouveeParEmail[] {
  const debut = debutEmailRecherche(recherche);
  const [trouvees, setTrouvees] = useState<{ debut: string; liste: TrouveeParEmail[] } | null>(null);
  useEffect(() => {
    if (!debut) return;
    let actif = true;
    const minuteur = setTimeout(() => {
      chercher(debut).then(
        (r) => {
          if (actif && r.ok) setTrouvees({ debut, liste: r.donnees ?? [] });
        },
        () => undefined,
      );
    }, DELAI_MS);
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [debut, chercher]);
  return debut && trouvees?.debut === debut ? trouvees.liste : [];
}
