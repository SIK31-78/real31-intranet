// Complement de donnees de l'ACCUEIL (home unifiee). Depuis le demantelement du
// dashboard (decision Sekou 2026-07-22), l'accueil heberge deux blocs venus de la
// vue portefeuille : le bandeau "a prendre en main" (onboarding) et les "problemes
// signales". Ce service les calcule en UNE seule lecture des copros du gestionnaire,
// sans dupliquer le lourd getDashboard (qui calculait aussi parcours/jalons/attention,
// inutiles ici). Passe par le routeur + services existants (ADR-001).

import { getCoproRepository } from "@/lib/adapters/router";
import { getPrisesEnMain } from "@/lib/services/coproprietes/prise-en-main";
import { getProblemes } from "@/lib/services/problemes/get-problemes";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import type { ProblemesCopro } from "@/lib/domain/supervision-ag";

export interface AccueilComplement {
  /** Copros aux dates heritees non encore validees (bac d'onboarding). 0 si feature inerte. */
  aPrendreEnMain: number;
  /** Problemes signales (items de supervision coches "probleme"), groupes par copro. */
  problemes: ProblemesCopro[];
}

export async function getAccueilComplement(g: Gestionnaire): Promise<AccueilComplement> {
  const tous = await getCoproRepository().list(g.id);
  const coprosMin = tous.map((c) => ({ code: c.code, nom: c.nom }));

  // Independants -> en parallele. `prises` null = onboarding inerte (mode mock) : rien a
  // prendre en main. `problemes` porte sur TOUT le perimetre (un probleme coche est un
  // signal explicite, jamais du bruit de migration), d'ou coprosMin non filtre.
  const [prises, problemes] = await Promise.all([
    getPrisesEnMain(tous.map((c) => c.code)),
    getProblemes(g.id, coprosMin),
  ]);

  const aPrendreEnMain = prises === null ? 0 : tous.filter((c) => !prises.has(c.code)).length;

  return { aPrendreEnMain, problemes };
}
