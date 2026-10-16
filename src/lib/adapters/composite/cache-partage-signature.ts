// Cache PARTAGÉ de la signature Signitic, entre toutes les instances serverless.
//
// Sentry du 16/10/2026 : l'appel à Signitic prend 2,9 s, et la page E-mails le refaisait à
// chaque affichage. Une signature change rarement : 1 h par défaut (SIGNITIC_TTL_S), avec
// le cache de données de Next (même remède que cache-partage-copros-estale.ts). Une absence
// de signature (Signitic en panne, adresse inconnue) n'est jamais mise en cache : on
// réessaie au prochain affichage.

import type { ProfilSignature, SignatureProvider } from "@/lib/ports/signature-provider";

/** Met une fonction par email en cache partagé (en prod : unstable_cache, injecté par le routeur). */
export type CacheurSignature = (charger: (email: string) => Promise<string>) => (email: string) => Promise<string>;

class SansSignature extends Error {}

export class CachePartageSignature implements SignatureProvider {
  private readonly signatureEnCache: (email: string) => Promise<string>;

  constructor(
    private readonly inner: SignatureProvider,
    cacheur: CacheurSignature,
  ) {
    this.signatureEnCache = cacheur(async (email) => {
      const html = await inner.getSignatureHtml(email);
      // Une erreur levée n'est pas mise en cache : c'est voulu pour « pas de signature ».
      if (!html) throw new SansSignature();
      return html;
    });
  }

  async getSignatureHtml(email: string): Promise<string | null> {
    try {
      return await this.signatureEnCache(email.trim().toLowerCase());
    } catch (e) {
      if (e instanceof SansSignature) return null;
      throw e;
    }
  }

  getProfil(email: string): Promise<ProfilSignature | null> {
    return this.inner.getProfil(email);
  }
}
