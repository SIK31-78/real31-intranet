// Cache PARTAGE de la liste des copros ESTALE, entre toutes les instances serverless.
//
// Le provider ESTALE garde deja la liste 10 min en memoire, mais cette memoire est PAR
// INSTANCE : chaque nouvelle instance Vercel repayait la connexion ESTALE et la requete
// liste, ~1,5 s sur l'accueil, la fiche copro, E-mails (Sentry, 14/10/2026). Ce decorateur
// pose la liste dans le cache de donnees de Next, commun a toutes les instances.
//
// Duree large (24 h par defaut, ESTALE_LISTE_TTL_S) : le portefeuille bouge au rythme des
// reprises, quelques copros par an (choix de Sekou du 14/10). Les dates d'AG/CS ne sont PAS
// dans cette liste (le composite les lit a chaque fois dans intranet_copro_dates) : elles
// restent fraiches. Un echec ESTALE n'est jamais mis en cache (l'erreur remonte telle quelle).

import type { Copropriete } from "@/lib/domain/copropriete";
import type { CoproEstaleProvider } from "@/lib/ports/copro-estale-provider";
import { normaliserRef } from "@/lib/domain/copro-fusion";

/** Met une fonction en cache partage (en prod : unstable_cache de Next, injecte par le routeur). */
export type Cacheur = (charger: () => Promise<Copropriete[]>) => () => Promise<Copropriete[]>;

export class CachePartageCoprosEstale implements CoproEstaleProvider {
  private readonly listerEnCache: () => Promise<Copropriete[]>;

  constructor(inner: CoproEstaleProvider, cacheur: Cacheur) {
    this.listerEnCache = cacheur(() => inner.listerCoprosEstale());
  }

  listerCoprosEstale(): Promise<Copropriete[]> {
    return this.listerEnCache();
  }

  async getCoproEstale(code: string): Promise<Copropriete | null> {
    const cible = normaliserRef(code);
    return (await this.listerEnCache()).find((c) => normaliserRef(c.code) === cible) ?? null;
  }
}
