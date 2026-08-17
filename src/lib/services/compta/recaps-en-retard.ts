// Recaps d'AG EN RETARD : les AG tenues dont le compte-rendu n'est jamais rentre.
//
// A NE PAS confondre avec la file `recaps-recus` : celle-ci liste des recaps PRESENTS a
// lire ; ici on liste des recaps ABSENTS. Ce sont deux natures d'objet - les melanger
// dans une meme file reintroduirait le flou de parcours qu'on retire.
//
// La regle (7 jours, tolerance de rapprochement, seuil d'historique) vit ENTIEREMENT dans
// le domaine (domain/recap-ag/retard) ; ce service ne fait que la nourrir : perimetre,
// lecture batch des dates de recap, tri.
//
// CLOISONNEMENT : meme cadrage que la file (copros-du-perimetre) - portefeuille pour un
// gestionnaire, AGENCES tenues pour un comptable, jamais tout le cabinet.
//
// Passe par le routeur (ADR-001). Degrade proprement : table absente / base indisponible
// -> liste vide, jamais une exception qui casse la page.

import { getRecapAgRepository } from "@/lib/adapters/router";
import {
  getCoprosDuPerimetre,
  type PerimetreUtilisateur,
} from "@/lib/services/coproprietes/copros-du-perimetre";
import { agSurveillee, evaluerRecapAg } from "@/lib/domain/recap-ag/retard";

export interface RecapEnRetard {
  coproCode: string;
  coproNom: string;
  /** Jour de l'AG surveillee, ISO "YYYY-MM-DD". */
  agDate: string;
  joursDeRetard: number;
  /**
   * La date vient du champ « prochaine AG » du referentiel : une AG PREVUE, passee et
   * jamais conclue. Deux lectures possibles, et le gestionnaire est le seul a pouvoir
   * trancher : soit l'AG s'est tenue et le recap manque, soit la date est fausse (le
   * referentiel porte des dates de remplissage posees en masse, type 30/06) et c'est
   * ELLE qu'il faut corriger. L'UI le dit au lieu de faire comme si c'etait sur.
   */
  datePrevisionnelle: boolean;
}

/**
 * Les copros du perimetre dont le recap d'AG manque au-dela du delai, la plus en retard
 * d'abord. `aujourdhui` est injecte (ISO "YYYY-MM-DD") pour rester testable.
 */
export async function listerRecapsEnRetard(
  params: PerimetreUtilisateur,
  aujourdhui: string,
): Promise<RecapEnRetard[]> {
  try {
    const copros = await getCoprosDuPerimetre(params);

    // Une seule passe : on retient la copro ET l'AG qu'on surveille pour elle.
    const surveillees = copros.flatMap((c) => {
      const ag = agSurveillee(c.prochaineAg?.date, c.derniereAgDate, aujourdhui);
      return ag ? [{ copro: c, ag }] : [];
    });
    if (surveillees.length === 0) return [];

    // Lecture BATCH : une requete pour tout le perimetre, pas un appel par copro.
    const datesParCopro = await getRecapAgRepository().listerDatesAgParCopro(
      surveillees.map((s) => s.copro.code),
    );

    return surveillees
      .flatMap(({ copro, ag }) => {
        const etat = evaluerRecapAg(ag.date, datesParCopro.get(copro.code) ?? [], aujourdhui);
        if (etat.statut !== "en_retard") return [];
        return [
          {
            coproCode: copro.code,
            coproNom: copro.nom,
            agDate: ag.date,
            joursDeRetard: etat.joursDeRetard,
            datePrevisionnelle: ag.origine === "prochaine",
          },
        ];
      })
      .sort((a, b) => b.joursDeRetard - a.joursDeRetard || a.coproCode.localeCompare(b.coproCode));
  } catch (err) {
    console.warn("[recaps-en-retard] alerte indisponible :", (err as Error).message);
    return [];
  }
}
