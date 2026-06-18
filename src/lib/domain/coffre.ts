// Domaine du gestionnaire de mots de passe (ADR-025). Types metier purs, zero
// dependance technique (ADR-001).
//
// ZERO-KNOWLEDGE : cote serveur (ports / adapters / services), un secret n'est
// JAMAIS en clair. Le domaine ne manipule que des artefacts CHIFFRES (blobs,
// cles enrobees, cles publiques), produits/consommes par lib/coffre/crypto cote
// client. Le seul type "en clair" (SecretClair) n'existe qu'en memoire du
// navigateur, apres dechiffrement.
//
// Convention de transport : les octets crypto traversent les ports en base64
// (serialisables, stockes en bytea cote Supabase). La conversion base64 <->
// Uint8Array se fait dans la couche client/service, pas ici.

// --- Artefacts crypto stockes (opaques pour le domaine) -------------------

/** Un blob chiffre symetrique (AES-GCM) : IV + texte chiffre, en base64. */
export interface BlobChiffreStocke {
  iv: string;
  ciphertext: string;
}

/** Une cle de coffre enrobee vers un membre (ECIES) : il faut la cle publique
 *  ephemere pour la deballer cote destinataire. Tout en base64. */
export interface CleEnrobeeMembre {
  ephemeralPublicKey: string;
  iv: string;
  ciphertext: string;
}

// --- Enums metier ---------------------------------------------------------

/** network (tous) | agency (latent) | service (transversal) | personal. */
export type ScopeCoffre = "network" | "agency" | "service" | "personal";

/** standard | high : le tier "tres sensible" (step-up), exploite en phase 2. */
export type Sensibilite = "standard" | "high";

export type RoleMembre = "member" | "admin";

export type MethodeDeverrouillage =
  | "passkey_prf"
  | "master_password"
  | "recovery_code"
  | "admin_escrow";

// --- Identite -------------------------------------------------------------

/** Un collaborateur (pm_user). Identite stable = azureOid (Entra). */
export interface Collaborateur {
  id: string;
  azureOid: string;
  email: string;
  nomComplet?: string;
  agenceId?: string;
  serviceIds: string[];
}

/** Cle publique d'un collaborateur, pour wrapper une cle de coffre vers lui. */
export interface ClePubliqueMembre {
  userId: string;
  /** Cle publique ECDH P-256 (spki), base64. */
  publicKey: string;
}

/** Entree d'annuaire (pour octroyer un acces a un coffre partage : il faut la
 *  cle publique du destinataire). */
export interface CollaborateurAnnuaire {
  id: string;
  email: string;
  nomComplet?: string;
  publicKey: string;
}

/** Un service de l'organisation (Vente, Syndic, Location, Gestion Locative). */
export interface ServiceOrg {
  id: string;
  nom: string;
}

/** Une facon de deverrouiller : la cle privee wrappee + parametres publics
 *  (credentialId passkey, salt/iterations KDF, version...). Une par methode. */
export interface Deverrouillage {
  id: string;
  method: MethodeDeverrouillage;
  label?: string;
  wrappedPrivateKey: BlobChiffreStocke;
  params: Record<string, unknown>;
}

// --- Coffres / membership / secrets (cote serveur = opaque) ---------------

export interface Coffre {
  id: string;
  scope: ScopeCoffre;
  nom: string;
  sensibilite: Sensibilite;
  agenceId?: string;
  serviceId?: string;
  ownerId?: string;
}

/** Coffre tel que vu par un membre : + son role + SA cle de coffre enrobee. */
export interface CoffreAccessible extends Coffre {
  role: RoleMembre;
  wrappedVaultKey: CleEnrobeeMembre;
}

export interface Membership {
  coffreId: string;
  userId: string;
  role: RoleMembre;
  wrappedVaultKey: CleEnrobeeMembre;
  grantedBy?: string;
}

/** Secret cote serveur : le blob chiffre + metadonnees techniques. PAS de clair
 *  (titre/url/login compris : tout est dans le blob, ADR-025). */
export interface SecretChiffre {
  id: string;
  coffreId: string;
  blob: BlobChiffreStocke;
  cryptoVersion: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** Secret EN CLAIR : n'existe qu'en memoire du navigateur, apres dechiffrement.
 *  C'est ce qui est serialise puis chiffre dans SecretChiffre.blob.
 *  copropriete + immeuble = contexte metier REAL31 (colonnes Entite / Immeuble). */
export interface SecretClair {
  titre: string;
  copropriete?: string;
  immeuble?: string;
  url?: string;
  login?: string;
  motDePasse: string;
  notes?: string;
}
