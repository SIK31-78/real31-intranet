// Mock en memoire du module Collaborateurs (mode COPRO_SOURCE absent).

import type { CollaborateurRepository } from "@/lib/ports/collaborateur-repository";
import type { Collaborateur, EquipeCopro, NouveauCollaborateur, RoleEquipe, TypeHabilitation } from "@/lib/domain/collaborateur";

const COLLABORATEURS: Collaborateur[] = [
  { id: "g1", nomComplet: "Élise Lambert", initiales: "EL", email: "elise@real31.fr", roleTable: "GESTIONNAIRE", agenceCode: "LGC", actif: true, habilitations: [] },
  { id: "g2", nomComplet: "Sandy Carrier", initiales: "SC", email: "sandy@real31.fr", roleTable: "DIRECTEUR_SYNDIC", agenceCode: "LGC", actif: true, habilitations: [] },
];
const EQUIPES: EquipeCopro[] = [{ code: "S001", nom: "Mock", statut: "active", managerId: "g1" }];

export class MockCollaborateurRepository implements CollaborateurRepository {
  async listerTous(): Promise<Collaborateur[]> {
    return [...COLLABORATEURS];
  }
  async get(userId: string): Promise<Collaborateur | null> {
    return COLLABORATEURS.find((c) => c.id === userId) ?? null;
  }
  async listerEquipes(): Promise<EquipeCopro[]> {
    return [...EQUIPES];
  }
  async creer(n: NouveauCollaborateur & { initiales: string; par: string }): Promise<string> {
    const id = `mock-${COLLABORATEURS.length + 1}`;
    COLLABORATEURS.push({ id, nomComplet: n.nomComplet, initiales: n.initiales, email: n.email, roleTable: n.roleTable, actif: true, arriveeISO: n.arriveeISO, habilitations: [] });
    return id;
  }
  async reaffecter(coproCode: string, role: RoleEquipe, userId: string | null): Promise<void> {
    const e = EQUIPES.find((x) => x.code === coproCode);
    if (!e) throw new Error(`Réaffectation de ${coproCode} : copropriété introuvable.`);
    const cle = role === "gestionnaire" ? "managerId" : role === "assistant" ? "assistantId" : "accountantId";
    if (userId) e[cle] = userId;
    else delete e[cle];
  }
  async noterDepart(userId: string, departISO: string, note: string | undefined): Promise<void> {
    const c = COLLABORATEURS.find((x) => x.id === userId);
    if (c) Object.assign(c, { departISO, actif: departISO > new Date().toISOString().slice(0, 10), ...(note !== undefined ? { note } : {}) });
  }
  async annulerDepart(userId: string): Promise<void> {
    const c = COLLABORATEURS.find((x) => x.id === userId);
    if (c) {
      delete c.departISO;
      c.actif = true;
    }
  }
  async ajouterHabilitation(userId: string, type: TypeHabilitation, agence: string | undefined): Promise<void> {
    const c = COLLABORATEURS.find((x) => x.id === userId);
    c?.habilitations.push({ id: `h${c.habilitations.length + 1}`, type, ...(agence ? { agence } : {}), depuisISO: new Date().toISOString().slice(0, 10) });
  }
  async cloreHabilitation(id: string): Promise<void> {
    for (const c of COLLABORATEURS) for (const h of c.habilitations) if (h.id === id) h.jusquaISO = new Date().toISOString().slice(0, 10);
  }
}
