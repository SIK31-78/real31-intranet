// Memoisation par requete (React `cache`) du referentiel copros.
//
// Le referentiel (composite eStale + miroir) est LOURD et TOUTES les pages de l'accueil le
// relisent : l'accueil compose plusieurs services (AG de la semaine, affaires en cours,
// complement onboarding/problemes/compta) qui appelaient chacun getCoproRepository().list()
// -> jusqu'a 3 lectures identiques par rendu. `cache` deduplique par argument (managerId) sur
// la duree d'UN rendu serveur : les N appels concurrents partagent une seule lecture.
//
// Ne change RIEN a la semantique de list() (meme cloisonnement managerId, meme resultat) :
// c'est une pure optimisation de rendu. Hors contexte de rendu (tests), `cache` retombe sur
// un simple pass-through -> comportement identique.

import { cache } from "react";
import { getCoproRepository } from "@/lib/adapters/router";
import type { Copropriete } from "@/lib/domain/copropriete";

/** Liste des copros du gestionnaire (ou transverse si managerId absent), memoisee par rendu. */
export const listerCoprosParRequete = cache(
  (managerId?: string): Promise<Copropriete[]> => getCoproRepository().list(managerId),
);
