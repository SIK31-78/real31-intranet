// Helpers partages par les services de facturation : resolution du bareme
// applicable a une copropriete.
//
// Durcissement vs legacy : cote PowerApps, un tarif absent de la grille
// remontait `blank` et etait silencieusement traite comme 0 (facture minoree
// sans alerte). Ici, un tarif manquant leve une erreur explicite.

import type { FacturationRepository } from "@/lib/ports/facturation-repository";

/**
 * Le contexte tarifaire d'une copro : l'annee de bareme de son contrat, et les tarifs
 * FIGES au contrat quand le recap AG les a photographies (depuis le 15/09/2026).
 *
 * POURQUOI FIGER (Sekou, 15/09) : « parfois en cours d'annee on change les frais de
 * relance, mais tant qu'on n'a pas signe de nouveau contrat ce sont les anciens ». La
 * grille est partagee par annee : la modifier en juin changeait le tarif des contrats
 * signes en janvier. Le contrat signe emporte ses tarifs ; la grille ne touche que les
 * contrats futurs. Les cycles d'avant (sans photo) gardent la regle par annee.
 */
export interface ContexteTarifaire {
  anneeBareme: number;
  /** Tarifs TTC figes au contrat, par identifiant de prestation. Absent = regle par annee. */
  tarifsContrat?: Record<string, number>;
}

export async function resoudreContexteTarifaire(
  repo: FacturationRepository,
  coproCode: string,
): Promise<ContexteTarifaire> {
  const contrat = await repo.getDernierContrat(coproCode);
  if (!contrat) {
    throw new Error(
      `Aucun contrat de gestion pour la copropriété ${coproCode} : barème introuvable.`,
    );
  }
  return {
    anneeBareme: Number(contrat.debutContrat.slice(0, 4)),
    ...(contrat.tarifs && Object.keys(contrat.tarifs).length > 0 ? { tarifsContrat: contrat.tarifs } : {}),
  };
}

/**
 * Tarif TTC obligatoire : celui fige au contrat s'il y est, sinon celui du bareme de
 * l'annee. Leve si la prestation est absente des deux.
 * `contexte` accepte encore un simple numero d'annee (regle historique).
 */
export async function exigerTarifTtc(
  repo: FacturationRepository,
  identifiantPrestation: string,
  contexte: number | ContexteTarifaire,
): Promise<number> {
  const annee = typeof contexte === "number" ? contexte : contexte.anneeBareme;
  if (typeof contexte !== "number") {
    const fige = contexte.tarifsContrat?.[identifiantPrestation];
    if (typeof fige === "number" && Number.isFinite(fige)) return fige;
  }
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
