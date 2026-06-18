// Port : annuaire et identite crypto des collaborateurs du coffre (ADR-025).
// Provisioning au login (pm_user), cles publiques (pour le partage), methodes
// de deverrouillage (cle privee wrappee, une par methode). Depend du domaine.

import type {
  Collaborateur,
  ClePubliqueMembre,
  Deverrouillage,
  MethodeDeverrouillage,
  BlobChiffreStocke,
} from "@/lib/domain/coffre";

/** Donnees minimales pour creer un collaborateur au 1er login (apres SSO). */
export interface NouveauCollaborateur {
  azureOid: string;
  email: string;
  nomComplet?: string;
  agenceId?: string;
  /** Cle publique ECDH P-256 (spki), base64, generee cote client a l'enrolement. */
  publicKey: string;
}

export interface CoffreIdentiteRepository {
  /** Provisioning : null si le collaborateur n'existe pas encore. */
  trouverParAzureOid(azureOid: string): Promise<Collaborateur | null>;
  creer(nouveau: NouveauCollaborateur): Promise<Collaborateur>;

  /** Cles publiques (pour wrapper une cle de coffre vers des membres). */
  getClePublique(userId: string): Promise<ClePubliqueMembre | null>;
  listerClesPubliques(userIds: string[]): Promise<ClePubliqueMembre[]>;

  /** Methodes de deverrouillage (cle privee wrappee, une par methode). */
  listerDeverrouillages(userId: string): Promise<Deverrouillage[]>;
  ajouterDeverrouillage(
    userId: string,
    method: MethodeDeverrouillage,
    wrappedPrivateKey: BlobChiffreStocke,
    params: Record<string, unknown>,
    label?: string,
  ): Promise<void>;
  supprimerDeverrouillage(deverrouillageId: string): Promise<void>;
}
