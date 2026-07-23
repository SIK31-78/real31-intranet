// Port (contrat) des cles API machine (table native intranet_api_keys).
// Ne depend que du domaine. Le CLAIR de la cle ne transite JAMAIS par ce port :
// la generation (auth/cle-api) hash la cle et ne persiste que le hash.

import type { CleApi } from "@/lib/domain/cle-api";

/** Une cle AVEC son hash : reservee a la verification d'auth (comparaison
 *  timing-safe cote auth). Ne jamais renvoyer ce type vers l'UI. */
export interface CleApiSecrete extends CleApi {
  /** sha256 hex de la cle complete. */
  cleHash: string;
}

export interface CreationCleApi {
  nom: string;
  /** sha256 hex de la cle generee (le clair reste chez l'appelant, montre une fois). */
  cleHash: string;
  /** 8 premiers caracteres du clair, pour l'affichage admin. */
  prefixe: string;
  scopes: string[];
  /** Gestionnaire lie ; absent = cle cabinet (lecture transverse seule). */
  managerId?: string;
  creePar?: string;
  /** ISO ; absent = pas d'expiration. */
  expiresAt?: string;
}

export interface ClesApiRepository {
  /** Cree la cle (hash deja calcule) et renvoie l'enregistrement (sans le clair). */
  creer(input: CreationCleApi): Promise<CleApi>;
  /** Toutes les cles (actives, expirees, revoquees), plus recente en premier. */
  lister(): Promise<CleApi[]>;
  /** Revocation logique (revoked_at = nowISO). No-op si deja revoquee. */
  revoquer(id: string, nowISO: string): Promise<void>;
  /** Resout une cle par le sha256 hex presente. null = inconnue. L'appelant (auth)
   *  re-verifie le hash en timing-safe avant d'accepter. */
  findByHash(hash: string): Promise<CleApiSecrete | null>;
  /** Compteur d'usage : last_used_at + usage_jour/usage_jour_date (best-effort). */
  enregistrerUsage(
    id: string,
    lastUsedAtISO: string,
    usageJour: number,
    usageJourDateISO: string,
  ): Promise<void>;
}
