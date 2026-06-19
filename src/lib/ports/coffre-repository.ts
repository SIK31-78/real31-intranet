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
  EntreeAudit,
  ActionAudit,
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
  /** Modif / suppression scopees au coffre (le coffreId borne l'operation). */
  modifierSecret(coffreId: string, secretId: string, blob: BlobChiffreStocke, cryptoVersion: number): Promise<void>;
  supprimerSecret(coffreId: string, secretId: string): Promise<void>;

  /** Insertion par lot (import) de secrets deja chiffres. */
  ajouterSecrets(
    coffreId: string,
    items: { blob: BlobChiffreStocke; cryptoVersion: number }[],
    createdBy?: string,
  ): Promise<void>;

  /** Journal d'audit : ecrit une entree (metadonnees seulement). */
  journaliser(
    coffreId: string,
    userId: string,
    action: ActionAudit,
    secretId?: string,
    details?: Record<string, unknown>,
  ): Promise<void>;
  /** Lit l'historique d'un coffre, plus recent en premier. */
  listerAudit(coffreId: string, limite?: number): Promise<EntreeAudit[]>;
}
