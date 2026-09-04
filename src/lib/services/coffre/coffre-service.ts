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
  EntreeAudit,
  ActionAudit,
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
  // Bootstrap : le tout premier collaborateur enrole devient admin global.
  const premier = (await identite.compterCollaborateurs()) === 0;
  const collaborateur = await identite.creer({
    azureOid: d.azureOid,
    email: d.email,
    nomComplet: d.nomComplet,
    publicKey: d.publicKey,
  });
  if (premier) await identite.definirAdmin(collaborateur.id, true);
  await identite.ajouterDeverrouillage(collaborateur.id, "master_password", d.wrappedPrivateKey, d.params);
  const coffreId = await getCoffreRepository().creerCoffre(
    { scope: "personal", nom: d.coffrePerso.nom, ownerId: collaborateur.id },
    { userId: collaborateur.id, wrappedVaultKey: d.coffrePerso.wrappedVaultKey },
  );
  return { userId: collaborateur.id, coffreId };
}

// --- Changement / reinitialisation du mot de passe maitre -------------------

/** CHANGEMENT (l'ancien mot de passe est connu) : la cle privee ne bouge pas,
 *  le client l'a juste re-enrobee avec la cle derivee du nouveau mot de passe.
 *  Aucune perte, et le serveur ne voit toujours qu'un blob opaque. */
export async function changerMotDePasseMaitre(
  userId: string,
  wrappedPrivateKey: BlobChiffreStocke,
  params: Record<string, unknown>,
): Promise<void> {
  await getCoffreIdentiteRepository().remplacerDeverrouillage(userId, "master_password", wrappedPrivateKey, params);
}

export interface DemandeReinitialisation {
  userId: string;
  publicKey: string;
  wrappedPrivateKey: BlobChiffreStocke;
  params: Record<string, unknown>;
  coffrePerso: { nom: string; wrappedVaultKey: CleEnrobeeMembre };
}

/** REINITIALISATION (mot de passe maitre oublie) : l'ancienne cle privee est
 *  IRRECUPERABLE - personne, serveur compris, ne peut la deballer. On ne
 *  "recupere" donc rien : on remplace l'identite crypto par une neuve et on
 *  assume les pertes, que l'UI a annoncees avant confirmation.
 *
 *  Ce qui saute, et pourquoi :
 *   - les appartenances : chaque cle de coffre y est enrobee vers l'ANCIENNE
 *     cle publique, donc indechiffrable avec la nouvelle identite ;
 *   - les coffres persos : plus personne n'a leur cle, les garder n'exposerait
 *     que du chiffre mort qui ferait planter l'ouverture ;
 *   - toutes les methodes de deverrouillage (passkey comprise : elle enrobe
 *     elle aussi l'ancienne cle privee).
 *  Les coffres PARTAGES survivent : leurs autres membres les lisent toujours,
 *  un admin pourra redonner l'acces.
 *
 *  Pas de transaction multi-tables ici : l'ordre est choisi pour qu'un echec en
 *  cours de route laisse une reinitialisation simplement REJOUABLE (les etapes
 *  de purge sont idempotentes et se retrouvent par owner, pas par appartenance). */
export async function reinitialiserIdentiteCoffre(d: DemandeReinitialisation): Promise<{ coffreId: string }> {
  const identite = getCoffreIdentiteRepository();
  const coffres = getCoffreRepository();

  for (const c of await coffres.listerCoffresAccessibles(d.userId)) {
    await coffres.retirerMembership(c.id, d.userId);
  }
  for (const c of await coffres.listerCoffresPersonnels(d.userId)) {
    await coffres.supprimerCoffre(c.id);
  }
  await identite.remplacerClePublique(d.userId, d.publicKey);
  await identite.supprimerDeverrouillages(d.userId);
  await identite.ajouterDeverrouillage(d.userId, "master_password", d.wrappedPrivateKey, d.params);
  const coffreId = await coffres.creerCoffre(
    { scope: "personal", nom: d.coffrePerso.nom, ownerId: d.userId },
    { userId: d.userId, wrappedVaultKey: d.coffrePerso.wrappedVaultKey },
  );
  return { coffreId };
}

// L'audit ne doit jamais casser l'operation metier : best-effort, on degrade en
// warning si l'ecriture echoue (ex : table d'audit pas encore creee).
async function journaliser(
  coffreId: string,
  userId: string,
  action: ActionAudit,
  secretId?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await getCoffreRepository().journaliser(coffreId, userId, action, secretId, details);
  } catch (err) {
    console.warn(`[coffre] audit non ecrit (${action}) :`, (err as Error).message);
  }
}

export async function ajouterSecretCoffre(
  coffreId: string,
  blob: BlobChiffreStocke,
  cryptoVersion: number,
  createdBy: string,
): Promise<string> {
  const id = await getCoffreRepository().ajouterSecret(coffreId, blob, cryptoVersion, createdBy);
  await journaliser(coffreId, createdBy, "create", id);
  return id;
}

export async function editerSecret(
  coffreId: string,
  secretId: string,
  blob: BlobChiffreStocke,
  cryptoVersion: number,
  userId: string,
): Promise<void> {
  await getCoffreRepository().modifierSecret(coffreId, secretId, blob, cryptoVersion);
  await journaliser(coffreId, userId, "update", secretId);
}

export async function supprimerSecretCoffre(coffreId: string, secretId: string, userId: string): Promise<void> {
  await getCoffreRepository().supprimerSecret(coffreId, secretId);
  await journaliser(coffreId, userId, "delete", secretId);
}

export async function listerAuditCoffre(coffreId: string): Promise<EntreeAudit[]> {
  return getCoffreRepository().listerAudit(coffreId);
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

/** Promeut / retrograde un collaborateur comme admin global (gouvernance). */
export async function definirAdminCollaborateur(userId: string, estAdmin: boolean): Promise<void> {
  await getCoffreIdentiteRepository().definirAdmin(userId, estAdmin);
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

/** Import par lot de secrets deja chiffres cote client. */
export async function importerSecretsCoffre(
  coffreId: string,
  items: { blob: BlobChiffreStocke; cryptoVersion: number }[],
  createdBy: string,
): Promise<void> {
  const repo = getCoffreRepository();
  await repo.ajouterSecrets(coffreId, items, createdBy);
  if (items.length > 0) await repo.journaliser(coffreId, createdBy, "import", undefined, { count: items.length });
}
