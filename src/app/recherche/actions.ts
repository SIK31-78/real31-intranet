"use server";

// Donnees de la palette de recherche (Ctrl+K / barre "Rechercher une copro"). Chargees a
// l'ouverture (lazy, une fois), pas de cout par page.
//
// PERIMETRE : le CABINET (services/coproprietes/perimetre-lecture), plus le seul
// portefeuille. La recherche cloisonnee laissait croire qu'une copro tenue par une
// collegue n'existait pas (plainte Emmanuel LOPES). Le portefeuille reste lu, mais
// seulement pour savoir quels resultats meritent la mention du gestionnaire.

import { getGestionnaireCourant } from "@/lib/auth/session";
import { getCoproprietes } from "@/lib/services/coproprietes/get-coproprietes";
import { coprosEnLecture } from "@/lib/services/coproprietes/perimetre-lecture";
import { projeterRecherche } from "@/lib/domain/recherche-copro";
import type { CoproRecherche } from "@/lib/domain/recherche-copro";

export async function chargerCoprosRecherche(): Promise<CoproRecherche[]> {
  const g = await getGestionnaireCourant();
  if (!g) return [];
  // Deux lectures independantes -> en parallele : ce qu'il peut CONSULTER (le cabinet)
  // et ce qui est A LUI (son portefeuille, = son perimetre d'ecriture).
  const [cabinet, siennes] = await Promise.all([coprosEnLecture(), getCoproprietes(g.id)]);
  return projeterRecherche(cabinet, new Set(siennes.map((c) => c.code)));
}
