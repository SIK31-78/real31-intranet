// Complement de donnees de l'ACCUEIL (home unifiee). Depuis le demantelement du
// dashboard (decision Sekou 2026-07-22), l'accueil heberge deux blocs venus de la
// vue portefeuille : le bandeau "a prendre en main" (onboarding) et les "problemes
// signales". Ce service les calcule en UNE seule lecture des copros du gestionnaire,
// sans dupliquer le lourd getDashboard (qui calculait aussi parcours/jalons/attention,
// inutiles ici). Passe par le routeur + services existants (ADR-001).

import { getComptaRepository } from "@/lib/adapters/router";
import { listerCoprosParRequete } from "@/lib/services/coproprietes/lister-copros-cache";
import { getPrisesEnMain } from "@/lib/services/coproprietes/prise-en-main";
import { getProblemes } from "@/lib/services/problemes/get-problemes";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import type { ProblemesCopro } from "@/lib/domain/supervision-ag";
import type { EtatCompta } from "@/lib/domain/compta";

/** Une copro du gestionnaire ou la comptable a laisse une (ou des) note(s) non resolue(s). */
export interface EchangeComptable {
  coproCode: string;
  coproNom: string;
  agDate: string;
  /** Nb de notes de la comptable non encore traitees. */
  nbNotes: number;
}

export interface AccueilComplement {
  /** Copros aux dates heritees non encore validees (bac d'onboarding). 0 si feature inerte. */
  aPrendreEnMain: number;
  /** Problemes signales (items de supervision coches "probleme"), groupes par copro. */
  problemes: ProblemesCopro[];
  /** Echanges comptables ouverts : notes de la comptable a traiter, par copro (AG a venir). */
  echangesComptables: EchangeComptable[];
}

export async function getAccueilComplement(g: Gestionnaire): Promise<AccueilComplement> {
  const tous = await listerCoprosParRequete(g.id);
  const coprosMin = tous.map((c) => ({ code: c.code, nom: c.nom }));

  // Copros avec une AG datee : cle pour lire l'etat compta (notes de la comptable).
  const avecAg = tous.filter((c) => c.prochaineAg?.date);

  // Independants -> en parallele. `prises` null = onboarding inerte (mode mock) : rien a
  // prendre en main. `problemes` porte sur TOUT le perimetre (un probleme coche est un
  // signal explicite, jamais du bruit de migration), d'ou coprosMin non filtre. L'etat
  // compta degrade en Map vide si la table native n'est pas deployee (jamais de crash).
  const [prises, problemes, etatsCompta] = await Promise.all([
    getPrisesEnMain(tous.map((c) => c.code)),
    getProblemes(g.id, coprosMin),
    getComptaRepository()
      .getEtats(avecAg.map((c) => ({ coproCode: c.code, agDateISO: c.prochaineAg!.date })))
      .catch((): Map<string, EtatCompta> => new Map()),
  ]);

  const aPrendreEnMain = prises === null ? 0 : tous.filter((c) => !prises.has(c.code)).length;

  // Remontee ACTIVE : les notes ecrites par la comptable, non resolues (le gestionnaire doit
  // repondre). Conditionnel (liste vide -> rien affiche). Trie par nb de notes decroissant.
  const echangesComptables: EchangeComptable[] = avecAg
    .map((c) => {
      const etat = etatsCompta.get(`${c.code}|${c.prochaineAg!.date}`);
      const nbNotes = (etat?.notes ?? []).filter((n) => n.auteur === "comptable" && !n.resolu).length;
      return { coproCode: c.code, coproNom: c.nom, agDate: c.prochaineAg!.date, nbNotes };
    })
    .filter((e) => e.nbNotes > 0)
    .sort((a, b) => b.nbNotes - a.nbNotes);

  return { aPrendreEnMain, problemes, echangesComptables };
}
