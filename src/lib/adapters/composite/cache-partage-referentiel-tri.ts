// Cache PARTAGE du referentiel ESTALE du tri, entre toutes les instances serverless.
//
// Le provider ESTALE du tri garde deja son referentiel 10 min en memoire, mais PAR INSTANCE :
// chaque nouvelle instance Vercel relancait une requete par copro (conseil, copropriétaires,
// fournisseurs), 4 a la fois, soit 4 a 13 s sur le premier clic de « Tri des e-mails »
// (Sentry, 14/10/2026). Meme remede que pour la liste des copros
// (cf. cache-partage-copros-estale.ts) : le cache de donnees de Next, commun aux instances.
//
// Duree plus courte que la liste des copros (1 h par defaut, ESTALE_REFERENTIEL_TRI_TTL_S) :
// les adresses des copropriétaires et des fournisseurs bougent plus souvent que le
// portefeuille. Next sert l'ancienne valeur pendant qu'il recharge : personne n'attend.
// Un echec ESTALE n'est jamais mis en cache (l'erreur remonte telle quelle).

import type { ReferentielTri } from "@/lib/domain/tri-emails";
import type { ReferentielTriProvider } from "@/lib/ports/referentiel-tri-provider";

/** Met une fonction en cache partage (en prod : unstable_cache de Next, injecte par le routeur). */
export type CacheurReferentiel = (charger: () => Promise<ReferentielTri>) => () => Promise<ReferentielTri>;

export class CachePartageReferentielTri implements ReferentielTriProvider {
  private readonly chargerEnCache: () => Promise<ReferentielTri>;

  constructor(inner: ReferentielTriProvider, cacheur: CacheurReferentiel) {
    this.chargerEnCache = cacheur(() => inner.charger());
  }

  charger(): Promise<ReferentielTri> {
    return this.chargerEnCache();
  }
}
