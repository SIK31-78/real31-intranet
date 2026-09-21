// Mock des delegations d'ecriture : en memoire, pour le dev hors base et les tests.

import type { DelegationEnregistree, DelegationRepository, NouvelleDelegation } from "@/lib/ports/delegation-repository";

export class MockDelegationRepository implements DelegationRepository {
  private static lignes: DelegationEnregistree[] = [];

  async listerPourBeneficiaire(userId: string): Promise<DelegationEnregistree[]> {
    return MockDelegationRepository.lignes.filter((d) => d.aUserId === userId && !d.clotureeLeISO);
  }
  async listerEnCours(): Promise<DelegationEnregistree[]> {
    return MockDelegationRepository.lignes.filter((d) => !d.clotureeLeISO);
  }
  async creer(d: NouvelleDelegation): Promise<string> {
    const id = `del-${MockDelegationRepository.lignes.length + 1}`;
    MockDelegationRepository.lignes.push({ ...d, id, createdAtISO: new Date().toISOString() });
    return id;
  }
  async cloturer(id: string): Promise<void> {
    const d = MockDelegationRepository.lignes.find((x) => x.id === id);
    if (d) d.clotureeLeISO = new Date().toISOString();
  }
}
