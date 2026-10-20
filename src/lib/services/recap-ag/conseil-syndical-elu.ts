// Service : le conseil syndical tel qu'il est connu au moment du récap d'AG (20/10/2026).
// Le CS vient d'être (ré)élu : c'est LE moment où la liste se met à jour, à la main (on
// n'automatise pas depuis Crypto, qui n'est plus tenu ; ESTALE remplacera tout).
//
// Réutilise l'état de la fiche copro (etatListeSecoursCS : source active de la cascade du
// mail au CS + liste de diffusion enregistrée) et y ajoute les membres ESTALE, avec ou sans
// adresse, pour les montrer en lecture : ceux-là se corrigent dans ESTALE, pas ici.
// Lecture seule, cloisonnée (exigerPerimetre). ESTALE en panne : pas de membres, jamais d'erreur.

import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { etatListeSecoursCS, type EtatListeSecoursCS } from "@/lib/services/coproprietes/etat-liste-secours-cs";
import { donneesCoproEstale } from "@/lib/services/estale/donnees-copro-estale";
import type { RoleConseil } from "@/lib/domain/copropriete";

export interface MembreCSEstale {
  nom: string;
  role: RoleConseil;
  /** Absente quand ESTALE ne la connaît pas : à renseigner dans ESTALE. */
  email?: string;
}

export interface ConseilSyndicalElu extends EtatListeSecoursCS {
  /** Membres du conseil dans ESTALE ; vide si la copro n'y est pas (ou ESTALE indisponible). */
  membresEstale: MembreCSEstale[];
}

export async function conseilSyndicalElu(coproCode: string, managerId: string): Promise<ConseilSyndicalElu> {
  await exigerPerimetre(coproCode, managerId);
  const [etat, membresEstale] = await Promise.all([
    etatListeSecoursCS(coproCode),
    donneesCoproEstale(coproCode)
      .then((d) =>
        (d?.conseilSyndical ?? []).map((m) => {
          const email = m.email?.trim();
          return { nom: m.nomComplet, role: m.role, ...(email ? { email } : {}) };
        }),
      )
      .catch((err: unknown) => {
        console.warn(`[recap-ag] conseil syndical ESTALE indisponible pour ${coproCode} :`, (err as Error).message);
        return [] as MembreCSEstale[];
      }),
  ]);
  return { ...etat, membresEstale };
}
