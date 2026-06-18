// Adapter mock : annuaire + identite crypto du coffre, en memoire (ADR-025).
// Store au niveau module (persiste le temps du process / d'un test). Sert a
// construire services et UI sans la vraie base ni le pont d'identite.

import type { CoffreIdentiteRepository, NouveauCollaborateur } from "@/lib/ports/coffre-identite-repository";
import type {
  Collaborateur,
  ClePubliqueMembre,
  CollaborateurAnnuaire,
  ServiceOrg,
  Deverrouillage,
  MethodeDeverrouillage,
  BlobChiffreStocke,
} from "@/lib/domain/coffre";

const collaborateurs = new Map<string, Collaborateur>();
const parOid = new Map<string, string>();
const clesPubliques = new Map<string, string>();
const deverrouillages = new Map<string, Deverrouillage[]>();

const SERVICES: ServiceOrg[] = [
  { id: "svc-vente", nom: "Vente" },
  { id: "svc-syndic", nom: "Syndic" },
  { id: "svc-location", nom: "Location" },
  { id: "svc-gestion-locative", nom: "Gestion Locative" },
];

export class MockCoffreIdentiteRepository implements CoffreIdentiteRepository {
  async trouverParAzureOid(azureOid: string): Promise<Collaborateur | null> {
    const id = parOid.get(azureOid);
    return id ? (collaborateurs.get(id) ?? null) : null;
  }

  async creer(nouveau: NouveauCollaborateur): Promise<Collaborateur> {
    const c: Collaborateur = {
      id: globalThis.crypto.randomUUID(),
      azureOid: nouveau.azureOid,
      email: nouveau.email,
      nomComplet: nouveau.nomComplet,
      agenceId: nouveau.agenceId,
      serviceIds: [],
    };
    collaborateurs.set(c.id, c);
    parOid.set(c.azureOid, c.id);
    clesPubliques.set(c.id, nouveau.publicKey);
    return c;
  }

  async getClePublique(userId: string): Promise<ClePubliqueMembre | null> {
    const publicKey = clesPubliques.get(userId);
    return publicKey ? { userId, publicKey } : null;
  }

  async listerClesPubliques(userIds: string[]): Promise<ClePubliqueMembre[]> {
    return userIds
      .map((userId) => {
        const publicKey = clesPubliques.get(userId);
        return publicKey ? { userId, publicKey } : null;
      })
      .filter((x): x is ClePubliqueMembre => x !== null);
  }

  async listerCollaborateurs(): Promise<CollaborateurAnnuaire[]> {
    return [...collaborateurs.values()]
      .map((c) => {
        const publicKey = clesPubliques.get(c.id);
        return publicKey ? { id: c.id, email: c.email, publicKey, ...(c.nomComplet ? { nomComplet: c.nomComplet } : {}) } : null;
      })
      .filter((x): x is CollaborateurAnnuaire => x !== null);
  }

  async listerServices(): Promise<ServiceOrg[]> {
    return SERVICES;
  }

  async listerDeverrouillages(userId: string): Promise<Deverrouillage[]> {
    return deverrouillages.get(userId) ?? [];
  }

  async ajouterDeverrouillage(
    userId: string,
    method: MethodeDeverrouillage,
    wrappedPrivateKey: BlobChiffreStocke,
    params: Record<string, unknown>,
    label?: string,
  ): Promise<void> {
    const liste = deverrouillages.get(userId) ?? [];
    liste.push({ id: globalThis.crypto.randomUUID(), method, label, wrappedPrivateKey, params });
    deverrouillages.set(userId, liste);
  }

  async supprimerDeverrouillage(deverrouillageId: string): Promise<void> {
    for (const [userId, liste] of deverrouillages) {
      deverrouillages.set(userId, liste.filter((d) => d.id !== deverrouillageId));
    }
  }
}
