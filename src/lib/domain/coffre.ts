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
  /** Admin global du coffre (gouvernance : creer des coffres partages, gerer les acces). */
  estAdmin: boolean;
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
  estAdmin: boolean;
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

// --- Journal d'audit (metadonnees seulement, jamais le contenu) ------------

export type ActionAudit = "create" | "update" | "delete" | "import";

export interface EntreeAudit {
  id: string;
  coffreId: string;
  secretId?: string;
  userId?: string;
  action: ActionAudit;
  details?: Record<string, unknown>;
  createdAt: string;
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

// --- Force du mot de passe MAITRE -----------------------------------------
// Le mot de passe maitre derive la cle du coffre (zero-knowledge) : il doit etre
// fort, sinon tout le coffre est faible. On REFUSE les mots de passe faibles a
// l'enrolement (avant : seul "8 caracteres" etait exige -> "12345678" passait).

export type NiveauForce = "faible" | "moyen" | "fort";

export interface ForceMotDePasse {
  niveau: NiveauForce;
  /** Acceptable comme mot de passe maitre ? On bloque "faible". */
  ok: boolean;
  /** Raison / conseil court si pas acceptable. */
  raison?: string;
}

// Petite liste de mots de passe / suites trop courants (compares en minuscules).
const MDP_COURANTS = new Set(
  [
    "12345678", "123456789", "1234567890", "123456789012", "azertyuiop", "qwertyuiop",
    "motdepasse", "password", "passw0rd", "azerty123", "qwerty123", "00000000",
    "11111111", "abcdefgh", "abcd1234", "real31", "soleil123", "loulou123",
  ].map((s) => s.toLowerCase()),
);

function nbClasses(mdp: string): number {
  let n = 0;
  if (/[a-z]/.test(mdp)) n++;
  if (/[A-Z]/.test(mdp)) n++;
  if (/[0-9]/.test(mdp)) n++;
  if (/[^a-zA-Z0-9]/.test(mdp)) n++;
  return n;
}

/** Evalue un mot de passe MAITRE. Regle : >= 12 caracteres, pas dans la liste des
 *  courants / pas un seul caractere repete, et soit du melange (>=3 classes) soit
 *  une vraie longueur (>=16, passphrase). Tout le reste est "faible" -> refuse. */
export function evaluerForceMotDePasse(mdp: string): ForceMotDePasse {
  const m = mdp ?? "";
  if (m.length < 12) {
    return { niveau: "faible", ok: false, raison: "Au moins 12 caractères." };
  }
  if (MDP_COURANTS.has(m.toLowerCase()) || /^(.)\1+$/.test(m)) {
    return { niveau: "faible", ok: false, raison: "Trop courant ou trop répétitif, choisis-en un autre." };
  }
  const c = nbClasses(m);
  if (m.length < 16 && c < 3) {
    return {
      niveau: "faible",
      ok: false,
      raison: "Ajoute des majuscules, chiffres et symboles - ou allonge-le (16 caractères et plus).",
    };
  }
  const fort = m.length >= 16 || c >= 4 || (m.length >= 14 && c >= 3);
  return { niveau: fort ? "fort" : "moyen", ok: true };
}

// --- Changement / reinitialisation du mot de passe maitre ------------------
// Deux gestes DIFFERENTS, a ne jamais confondre :
//   - CHANGER : on connait l'ancien mot de passe. La cle privee ne bouge pas,
//     on la re-enrobe simplement avec la cle derivee du nouveau. Zero perte.
//   - REINITIALISER : on a oublie l'ancien. La cle privee est irrecuperable
//     (personne, serveur compris, ne peut la deballer) -> on repart d'une
//     identite NEUVE et le contenu des coffres persos est perdu. C'est le prix
//     du zero-knowledge : le contourner reviendrait a poser une porte derobee.

export interface VerificationNouveauMdp {
  ok: boolean;
  raison?: string;
}

/** Regles communes aux deux gestes : force suffisante, confirmation identique,
 *  et (si `ancien` est connu) un mot de passe reellement different. */
export function validerNouveauMotDePasseMaitre(
  nouveau: string,
  confirmation: string,
  ancien?: string,
): VerificationNouveauMdp {
  const force = evaluerForceMotDePasse(nouveau);
  if (!force.ok) return { ok: false, raison: force.raison ?? "Mot de passe trop faible." };
  if (nouveau !== confirmation) return { ok: false, raison: "Les deux mots de passe ne correspondent pas." };
  if (ancien !== undefined && ancien.length > 0 && nouveau === ancien) {
    return { ok: false, raison: "Choisis un mot de passe différent de l'actuel." };
  }
  return { ok: true };
}

/** Ce qu'une reinitialisation va coûter, coffre par coffre. Sert a ecrire un
 *  avertissement HONNETE avant de demander confirmation (rien n'est recuperable
 *  apres coup). */
export interface ImpactReinitialisation {
  /** Coffres persos : leur contenu est DEFINITIVEMENT perdu (personne n'a la cle). */
  perdus: { id: string; nom: string }[];
  /** Coffres partages : l'acces est coupe ; un admin pourra le redonner ensuite. */
  aReoctroyer: { id: string; nom: string }[];
  /** Y a-t-il au moins un coffre perso a perdre ? */
  perteDefinitive: boolean;
}

/** Trie les coffres de l'utilisateur entre perte definitive (perso) et acces a
 *  redonner (partages). Pur : ne lit rien, ne chiffre rien. */
export function impactReinitialisation(coffres: readonly Coffre[]): ImpactReinitialisation {
  const perdus: { id: string; nom: string }[] = [];
  const aReoctroyer: { id: string; nom: string }[] = [];
  for (const c of coffres) {
    (c.scope === "personal" ? perdus : aReoctroyer).push({ id: c.id, nom: c.nom });
  }
  return { perdus, aReoctroyer, perteDefinitive: perdus.length > 0 };
}
