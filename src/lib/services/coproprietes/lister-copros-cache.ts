// Memoisation par requete (React `cache`) du referentiel copros, SENSIBLE A LA VUE.
//
// Le referentiel (composite eStale + miroir) est LOURD et TOUTES les pages de l'accueil le
// relisent : l'accueil compose plusieurs services (AG de la semaine, affaires en cours,
// complement onboarding/problemes/compta) qui appelaient chacun getCoproRepository().list()
// -> jusqu'a 3 lectures identiques par rendu. `cache` deduplique par argument (managerId) sur
// la duree d'UN rendu serveur : les N appels concurrents partagent une seule lecture.
//
// LA VUE (ADR-041, 21/09/2026) : la page pose une fois la vue choisie par le collaborateur
// (« Mon portefeuille », « Mon agence / Mes delegations », « Le cabinet ») et tous les
// services de la page la suivent sans changer de signature. Hors rendu (tests), `cache`
// retombe sur un pass-through : la vue est toujours le portefeuille, comme avant.

import { cache } from "react";
import { getCoproRepository } from "@/lib/adapters/router";
import type { Copropriete } from "@/lib/domain/copropriete";
import type { VuePerimetre } from "@/lib/domain/perimetre-ecriture";
import { coprosEcrivables } from "@/lib/services/coproprietes/perimetre-ecriture";

const vueDeLaRequete = cache((): { vue: VuePerimetre } => ({ vue: "portefeuille" }));

/** La page pose la vue pour tout le rendu. A appeler AVANT les services qui listent. */
export function definirVueRequete(vue: VuePerimetre): void {
  vueDeLaRequete().vue = vue;
}

export function vueRequete(): VuePerimetre {
  return vueDeLaRequete().vue;
}

/**
 * Liste des copros du gestionnaire selon la vue de la requete (portefeuille par defaut),
 * ou transverse si managerId absent, memoisee par rendu.
 */
export const listerCoprosParRequete = cache((managerId?: string): Promise<Copropriete[]> => {
  const repo = getCoproRepository();
  if (!managerId) return repo.list();
  const vue = vueRequete();
  if (vue === "cabinet") return repo.list();
  if (vue === "perimetre") return coprosEcrivables(managerId);
  return repo.list(managerId);
});
