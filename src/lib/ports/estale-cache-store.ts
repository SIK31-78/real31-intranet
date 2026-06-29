// Port : cache read-through des donnees eStale d'une copro (ADR-002). eStale fait
// 5-6 requetes GraphQL lentes par copro ; on memorise le resultat avec un TTL court
// dans une table Supabase (persistant, partage entre instances serverless, contrairement
// a un cache memoire perdu au cold start). Ne depend que du domaine.

import type { DonneesEstaleCopro } from "@/lib/domain/copropriete";

export interface EstaleCacheStore {
  /** Donnees en cache si presentes ET plus recentes que ttlSeconds, sinon null. */
  lire(coproCode: string, ttlSeconds: number): Promise<DonneesEstaleCopro | null>;
  /** Memorise (upsert) les donnees d'une copro. */
  ecrire(coproCode: string, donnees: DonneesEstaleCopro): Promise<void>;
  /** Invalide le cache d'une copro (bouton "rafraichir maintenant"). */
  invalider(coproCode: string): Promise<void>;
}
