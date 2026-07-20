// Helpers partages par les services de facturation : resolution du bareme
// applicable a une copropriete.
//
// Durcissement vs legacy : cote PowerApps, un tarif absent de la grille
// remontait `blank` et etait silencieusement traite comme 0 (facture minoree
// sans alerte). Ici, un tarif manquant leve une erreur explicite.

import type { FacturationRepository } from "@/lib/ports/facturation-repository";

/**
 * Annee de bareme applicable a une copropriete = annee de debut du contrat de
 * gestion le plus recent. Utilise par toutes les prestations SYNDIC ponctuelles.
 * (Le depassement d'AG fait exception : il utilise l'annee de l'exercice
 * approuve, soit N-1 par rapport a la date d'AG.)
 */
export async function resoudreAnneeBareme(
  repo: FacturationRepository,
  coproCode: string,
): Promise<number> {
  const contrat = await repo.getDernierContrat(coproCode);
  if (!contrat) {
    throw new Error(
      `Aucun contrat de gestion pour la copropriete ${coproCode} : bareme introuvable.`,
    );
  }
  return Number(contrat.debutContrat.slice(0, 4));
}

/** Tarif TTC obligatoire : leve si la prestation est absente du bareme. */
export async function exigerTarifTtc(
  repo: FacturationRepository,
  identifiantPrestation: string,
  annee: number,
): Promise<number> {
  const tarif = await repo.getTarifTtc(identifiantPrestation, annee);
  if (tarif === null) {
    throw new Error(`Tarif "${identifiantPrestation}" absent du bareme ${annee}.`);
  }
  return tarif;
}

/** Date du jour au format ISO "YYYY-MM-DD" (date d'emission des factures). */
export function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}
