// Adapter mock : coffres, appartenances et secrets chiffres, en memoire (ADR-025).
// Le store ne voit que des blobs opaques (zero-knowledge). Store au niveau module.

import type { CoffreRepository, NouveauCoffre, PremierMembre } from "@/lib/ports/coffre-repository";
import type {
  Coffre,
  CoffreAccessible,
  Membership,
  SecretChiffre,
  BlobChiffreStocke,
  EntreeAudit,
  ActionAudit,
} from "@/lib/domain/coffre";

const coffres = new Map<string, Coffre>();
let memberships: Membership[] = [];
const secrets = new Map<string, SecretChiffre>();
const audit: EntreeAudit[] = [];

export class MockCoffreRepository implements CoffreRepository {
  async listerCoffresAccessibles(userId: string): Promise<CoffreAccessible[]> {
    return memberships
      .filter((m) => m.userId === userId)
      .map((m) => {
        const coffre = coffres.get(m.coffreId);
        if (!coffre) return null;
        return { ...coffre, role: m.role, wrappedVaultKey: m.wrappedVaultKey };
      })
      .filter((x): x is CoffreAccessible => x !== null);
  }

  async creerCoffre(nouveau: NouveauCoffre, premierMembre: PremierMembre): Promise<string> {
    const coffre: Coffre = {
      id: globalThis.crypto.randomUUID(),
      scope: nouveau.scope,
      nom: nouveau.nom,
      sensibilite: nouveau.sensibilite ?? "standard",
      agenceId: nouveau.agenceId,
      serviceId: nouveau.serviceId,
      ownerId: nouveau.ownerId,
    };
    coffres.set(coffre.id, coffre);
    memberships.push({
      coffreId: coffre.id,
      userId: premierMembre.userId,
      role: "admin",
      wrappedVaultKey: premierMembre.wrappedVaultKey,
      grantedBy: premierMembre.userId,
    });
    return coffre.id;
  }

  async listerCoffresPersonnels(userId: string): Promise<Coffre[]> {
    return [...coffres.values()].filter((c) => c.scope === "personal" && c.ownerId === userId);
  }

  async supprimerCoffre(coffreId: string): Promise<void> {
    coffres.delete(coffreId);
    memberships = memberships.filter((m) => m.coffreId !== coffreId);
    for (const [id, s] of secrets) if (s.coffreId === coffreId) secrets.delete(id);
    for (let i = audit.length - 1; i >= 0; i--) if (audit[i].coffreId === coffreId) audit.splice(i, 1);
  }

  async listerMemberships(coffreId: string): Promise<Membership[]> {
    return memberships.filter((m) => m.coffreId === coffreId);
  }

  async ajouterMembership(membership: Membership): Promise<void> {
    memberships = memberships.filter(
      (m) => !(m.coffreId === membership.coffreId && m.userId === membership.userId),
    );
    memberships.push(membership);
  }

  async retirerMembership(coffreId: string, userId: string): Promise<void> {
    memberships = memberships.filter((m) => !(m.coffreId === coffreId && m.userId === userId));
  }

  async listerSecrets(coffreId: string): Promise<SecretChiffre[]> {
    return [...secrets.values()].filter((s) => s.coffreId === coffreId);
  }

  async ajouterSecret(
    coffreId: string,
    blob: BlobChiffreStocke,
    cryptoVersion: number,
    createdBy?: string,
  ): Promise<string> {
    const maintenant = new Date().toISOString();
    const secret: SecretChiffre = {
      id: globalThis.crypto.randomUUID(),
      coffreId,
      blob,
      cryptoVersion,
      createdBy,
      createdAt: maintenant,
      updatedAt: maintenant,
    };
    secrets.set(secret.id, secret);
    return secret.id;
  }

  async modifierSecret(
    coffreId: string,
    secretId: string,
    blob: BlobChiffreStocke,
    cryptoVersion: number,
  ): Promise<void> {
    const secret = secrets.get(secretId);
    if (!secret || secret.coffreId !== coffreId) return;
    secrets.set(secretId, { ...secret, blob, cryptoVersion, updatedAt: new Date().toISOString() });
  }

  async supprimerSecret(coffreId: string, secretId: string): Promise<void> {
    const secret = secrets.get(secretId);
    if (secret && secret.coffreId === coffreId) secrets.delete(secretId);
  }

  async ajouterSecrets(
    coffreId: string,
    items: { blob: BlobChiffreStocke; cryptoVersion: number }[],
    createdBy?: string,
  ): Promise<void> {
    const maintenant = new Date().toISOString();
    for (const it of items) {
      const id = globalThis.crypto.randomUUID();
      secrets.set(id, {
        id,
        coffreId,
        blob: it.blob,
        cryptoVersion: it.cryptoVersion,
        createdBy,
        createdAt: maintenant,
        updatedAt: maintenant,
      });
    }
  }

  async journaliser(
    coffreId: string,
    userId: string,
    action: ActionAudit,
    secretId?: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    audit.push({
      id: globalThis.crypto.randomUUID(),
      coffreId,
      userId,
      action,
      createdAt: new Date().toISOString(),
      ...(secretId ? { secretId } : {}),
      ...(details ? { details } : {}),
    });
  }

  async listerAudit(coffreId: string, limite = 50): Promise<EntreeAudit[]> {
    return audit
      .filter((e) => e.coffreId === coffreId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limite);
  }
}
