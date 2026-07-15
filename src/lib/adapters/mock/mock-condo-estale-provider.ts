// Adapter mock des donnees copro sourcees Estale (CS, historique AG, conformite).
// Reflete la forme des types Estale (Council / Meeting / CondoServiceBook) sans en
// dependre. En J4, un EstaleCondoAdapter remplacera ce mock derriere le meme port.

import type { CondoEstaleProvider } from "@/lib/ports/condo-estale-provider";
import type { DonneesEstaleCopro } from "@/lib/domain/copropriete";

const DONNEES: Record<string, DonneesEstaleCopro> = {
  S104: {
    // Emails FICTIFS (domaine example.test) : demontrent la source "eStale" du mail au
    // conseil en local. Aucune vraie adresse (pas de PII dans un mock committe).
    conseilSyndical: [
      { nomComplet: "Mme Dupont", role: "president", email: "dupont@example.test" },
      { nomComplet: "M. Lefèvre", role: "membre", email: "lefevre@example.test" },
      { nomComplet: "Mme Rossi", role: "membre", email: "rossi@example.test" },
    ],
    mandatJusqua: "AG 2026",
    historiqueAg: [
      { date: "2025-04-12", type: "AG", presents: 18, total: 24, pvDispo: true },
      { date: "2024-10-18", type: "AGE", libelle: "vote ravalement façade", presents: 21, total: 24, pvDispo: true },
      { date: "2024-04-15", type: "AG", presents: 19, total: 24, pvDispo: true },
      { date: "2023-05-08", type: "AG", presents: 17, total: 24, pvDispo: true },
    ],
    conformite: [
      { libelle: "AG annuelle à jour", etat: "ok" },
      { libelle: "Carnet d'entretien renseigné", etat: "ok" },
      { libelle: "DTG en cours de validité", etat: "ok" },
      { libelle: "PPT à programmer", etat: "attention" },
    ],
  },
  S088: {
    conseilSyndical: [
      { nomComplet: "M. Bernard", role: "president" },
      { nomComplet: "Mme Petit", role: "membre" },
      { nomComplet: "M. Garcia", role: "membre" },
      { nomComplet: "Mme Moreau", role: "membre" },
    ],
    mandatJusqua: "AG 2027",
    historiqueAg: [
      { date: "2025-06-20", type: "AG", presents: 31, total: 48, pvDispo: true },
      { date: "2023-12-05", type: "AGE", libelle: "ravalement + toiture", presents: 35, total: 48, pvDispo: true },
      { date: "2024-06-18", type: "AG", presents: 28, total: 48, pvDispo: true },
    ],
    conformite: [
      { libelle: "AG annuelle à jour", etat: "ok" },
      { libelle: "Carnet d'entretien renseigné", etat: "ok" },
      { libelle: "DTG à renouveler", etat: "attention" },
      { libelle: "PPT voté", etat: "ok" },
    ],
  },
  S045: {
    conseilSyndical: [
      { nomComplet: "Mme Faure", role: "president" },
      { nomComplet: "M. Roy", role: "membre" },
    ],
    mandatJusqua: "AG 2026",
    historiqueAg: [
      { date: "2025-05-22", type: "AG", presents: 12, total: 16, pvDispo: true },
      { date: "2024-05-15", type: "AG", presents: 11, total: 16, pvDispo: true },
    ],
    conformite: [
      { libelle: "AG annuelle à jour", etat: "ok" },
      { libelle: "Carnet d'entretien renseigné", etat: "ok" },
      { libelle: "DTG en cours de validité", etat: "ok" },
      { libelle: "PPT à programmer", etat: "attention" },
    ],
  },
};

export class MockCondoEstaleProvider implements CondoEstaleProvider {
  async getDonneesCopro(code: string): Promise<DonneesEstaleCopro | null> {
    return DONNEES[code] ?? null;
  }
}
