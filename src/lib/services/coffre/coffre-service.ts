// Service du coffre : compose l'identite + les coffres via le routeur, jamais un
// adapter en direct (ADR-001). Ne manipule que des blobs chiffres (zero-knowledge).

import type {
  Collaborateur,
  Deverrouillage,
  CoffreAccessible,
  SecretChiffre,
  BlobChiffreStocke,
  CleEnrobeeMembre,
  CollaborateurAnnuaire,
  ServiceOrg,
  Membership,
  MethodeDeverrouillage,
  ScopeCoffre,
} from "@/lib/domain/coffre";
import { getCoffreRepository, getCoffreIdentiteRepository } from "@/lib/adapters/router";

export interface ApercuCoffre {
  collaborateur: Collaborateur | null;
  deverrouillages: Deverrouillage[];
  coffres: CoffreAccessible[];
}

/** Etat du coffre pour l'utilisateur : enrole ou non, ses coffres, ses methodes. */
export async function getApercuCoffre(azureOid: string): Promise<ApercuCoffre> {
  const identite = getCoffreIdentiteRepository();
  const collaborateur = await identite.trouverParAzureOid(azureOid);
  if (!collaborateur) return { collaborateur: null, deverrouillages: [], coffres: [] };
  const [deverrouillages, coffres] = await Promise.all([
    identite.listerDeverrouillages(collaborateur.id),
    getCoffreRepository().listerCoffresAccessibles(collaborateur.id),
  ]);
  return { collaborateur, deverrouillages, coffres };
}

export async function getSecretsCoffre(coffreId: string): Promise<SecretChiffre[]> {
  return getCoffreRepository().listerSecrets(coffreId);
}

export interface DemandeEnrolement {
  azureOid: string;
  email: string;
  nomComplet?: string;
  publicKey: string;
  wrappedPrivateKey: BlobChiffreStocke;
  params: Record<string, unknown>;
  coffrePerso: { nom: string; wrappedVaultKey: CleEnrobeeMembre };
}

/** Enrole un collaborateur : cree son identite, sa methode de deverrouillage, et
 *  son coffre perso (avec la cle de coffre deja enrobee vers lui-meme). */
export async function enrolerCollaborateur(d: DemandeEnrolement): Promise<{ userId: string; coffreId: string }> {
  const identite = getCoffreIdentiteRepository();
  const collaborateur = await identite.creer({
    azureOid: d.azureOid,
    email: d.email,
    nomComplet: d.nomComplet,
    publicKey: d.publicKey,
  });
  await identite.ajouterDeverrouillage(collaborateur.id, "master_password", d.wrappedPrivateKey, d.params);
  const coffreId = await getCoffreRepository().creerCoffre(
    { scope: "personal", nom: d.coffrePerso.nom, ownerId: collaborateur.id },
    { userId: collaborateur.id, wrappedVaultKey: d.coffrePerso.wrappedVaultKey },
  );
  return { userId: collaborateur.id, coffreId };
}

export async function ajouterSecretCoffre(
  coffreId: string,
  blob: BlobChiffreStocke,
  cryptoVersion: number,
  createdBy: string,
): Promise<string> {
  return getCoffreRepository().ajouterSecret(coffreId, blob, cryptoVersion, createdBy);
}

/** Ajoute une methode de deverrouillage (ex: passkey PRF) a un collaborateur. */
export async function ajouterDeverrouillageCoffre(
  userId: string,
  method: MethodeDeverrouillage,
  wrappedPrivateKey: BlobChiffreStocke,
  params: Record<string, unknown>,
): Promise<void> {
  await getCoffreIdentiteRepository().ajouterDeverrouillage(userId, method, wrappedPrivateKey, params);
}

// --- Coffres partages (reseau / service) -----------------------------------

/** Annuaire des collaborateurs enroles (avec cle publique), pour l'octroi. */
export async function listerAnnuaire(): Promise<CollaborateurAnnuaire[]> {
  return getCoffreIdentiteRepository().listerCollaborateurs();
}

/** Services de l'organisation (pour cibler un coffre de service). */
export async function listerServicesCoffre(): Promise<ServiceOrg[]> {
  return getCoffreIdentiteRepository().listerServices();
}

/** Cree un coffre partage (reseau ou service) ; le createur en est l'admin. */
export async function creerCoffrePartage(
  scope: Exclude<ScopeCoffre, "personal" | "agency">,
  nom: string,
  premierMembre: { userId: string; wrappedVaultKey: CleEnrobeeMembre },
  serviceId?: string,
): Promise<string> {
  return getCoffreRepository().creerCoffre(
    { scope, nom, ...(serviceId ? { serviceId } : {}) },
    { userId: premierMembre.userId, wrappedVaultKey: premierMembre.wrappedVaultKey },
  );
}

/** Octroie l'acces d'un coffre a un membre (sa cle de coffre enrobee vers lui). */
export async function octroyerAcces(
  coffreId: string,
  userId: string,
  wrappedVaultKey: CleEnrobeeMembre,
  grantedBy: string,
): Promise<void> {
  await getCoffreRepository().ajouterMembership({
    coffreId,
    userId,
    role: "member",
    wrappedVaultKey,
    grantedBy,
  });
}

/** Retire l'acces d'un membre (coupe les lectures futures via RLS/cloisonnement).
 *  La rotation complete de la cle du coffre est traitee en phase 5. */
export async function retirerAcces(coffreId: string, userId: string): Promise<void> {
  await getCoffreRepository().retirerMembership(coffreId, userId);
}

export async function listerMembres(coffreId: string): Promise<Membership[]> {
  return getCoffreRepository().listerMemberships(coffreId);
}
