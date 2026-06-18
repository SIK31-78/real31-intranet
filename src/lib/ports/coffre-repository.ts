// Port : coffres, appartenances et secrets chiffres (ADR-025). Le repository ne
// voit que des BLOBS opaques (zero-knowledge) ; la (de)chiffrement vit cote
// client. Depend du domaine.

import type {
  CoffreAccessible,
  Membership,
  SecretChiffre,
  BlobChiffreStocke,
  CleEnrobeeMembre,
  ScopeCoffre,
  Sensibilite,
} from "@/lib/domain/coffre";

export interface NouveauCoffre {
  scope: ScopeCoffre;
  nom: string;
  sensibilite?: Sensibilite;
  agenceId?: string;
  serviceId?: string;
  ownerId?: string;
}

/** Le 1er membre d'un coffre (son createur) : admin, avec la cle de coffre
 *  enrobee vers lui-meme. */
export interface PremierMembre {
  userId: string;
  wrappedVaultKey: CleEnrobeeMembre;
}

export interface CoffreRepository {
  /** Coffres dont l'utilisateur est membre, avec SA cle de coffre enrobee. */
  listerCoffresAccessibles(userId: string): Promise<CoffreAccessible[]>;
  /** Cree le coffre + l'appartenance admin du createur. Renvoie l'id du coffre. */
  creerCoffre(nouveau: NouveauCoffre, premierMembre: PremierMembre): Promise<string>;

  /** Appartenances d'un coffre (octroi / retrait = partage). */
  listerMemberships(coffreId: string): Promise<Membership[]>;
  ajouterMembership(membership: Membership): Promise<void>;
  retirerMembership(coffreId: string, userId: string): Promise<void>;

  /** Secrets d'un coffre (blobs chiffres). */
  listerSecrets(coffreId: string): Promise<SecretChiffre[]>;
  ajouterSecret(
    coffreId: string,
    blob: BlobChiffreStocke,
    cryptoVersion: number,
    createdBy?: string,
  ): Promise<string>;
  modifierSecret(secretId: string, blob: BlobChiffreStocke, cryptoVersion: number): Promise<void>;
  supprimerSecret(secretId: string): Promise<void>;
}
