// Port (contrat) du provider des copros lues EN DIRECT sur l'API eStale (les copros
// REAL31 : identite, adresse, agence, equipe). Distinct du referentiel miroir
// (CoproRepository) et du CondoEstaleProvider (CS / historique / compta d'UNE copro) :
// ici on liste les copros du cabinet pour les fusionner au miroir. Ne depend que du domaine.
//
// eStale N'A PAS les dates d'AG/CS planifiees : les copros renvoyees ici sont SANS date
// (prochaineAg/derniereAgDate absents). Le composite les complete depuis intranet_copro_dates.

import type { Copropriete } from "@/lib/domain/copropriete";

export interface CoproEstaleProvider {
  /** Les copros du cabinet sur eStale (identite + agence + equipe, SANS dates). Cachee. */
  listerCoprosEstale(): Promise<Copropriete[]>;
  /** Une copro eStale par son code (reference normalisee, ex "S300"), ou null. */
  getCoproEstale(code: string): Promise<Copropriete | null>;
}
