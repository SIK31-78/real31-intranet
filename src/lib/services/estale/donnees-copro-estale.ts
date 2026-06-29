// Service : donnees eStale d'une copro EN READ-THROUGH (ADR-002). Le cache est consulte
// d'abord ; en cas de miss/expiration, on appelle eStale (5-6 requetes GraphQL lentes)
// UNE fois, on memorise, et les rendus suivants (fiche copro, contexte mail) servent le
// cache. TTL court (defaut 20 min ; les donnees CS/compta ne changent pas a l'heure).
// Passe par le routeur (ADR-001).

import type { DonneesEstaleCopro } from "@/lib/domain/copropriete";
import { getCondoEstaleProvider, getEstaleCacheStore } from "@/lib/adapters/router";

const TTL_S = Number(process.env.ESTALE_CACHE_TTL_S) || 20 * 60;

export async function donneesCoproEstale(code: string): Promise<DonneesEstaleCopro | null> {
  if (!code) return null;
  const cache = getEstaleCacheStore();
  const hit = await cache.lire(code, TTL_S);
  if (hit) return hit;
  const donnees = await getCondoEstaleProvider().getDonneesCopro(code);
  // On ne cache PAS les null (copro pas (encore) sur eStale) : peu couteux, peut changer.
  if (donnees) await cache.ecrire(code, donnees);
  return donnees;
}
