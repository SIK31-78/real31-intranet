// File « Récaps d'AG reçus » : le recap post-AG rendu au comptable comme NOTE DE TRAVAIL
// (budget vote a saisir, pourcentage de fonds travaux, appels de fonds des travaux votes,
// nouveau cycle de contrat a ouvrir).
//
// POURQUOI UNE FILE A PART, indexee sur le recap et pas sur la copro. Tout l'espace
// comptable existant regarde en AVANT : `listerLignesComptables` ne garde que les AG a
// venir (`prochaineAg.date >= today`), `listerAgAPreparer` filtre aussi sur `prochaineAg`,
// et `conclureAg` VIDE `prochaine` des que l'AG est conclue. Autrement dit, a la seconde
// ou une AG est tenue, la copro disparait des deux ecrans - exactement le moment ou le
// comptable en a besoin. Une file qui part des RECAPS contourne ca par construction :
// ne jamais y reintroduire de dependance a `prochaineAg`.
//
// CLOISONNEMENT : le meme cadrage que la facturation (copros-du-perimetre) - portefeuille
// pour un gestionnaire, AGENCES tenues pour un comptable, jamais tout le cabinet. Il vaut
// pour la liste ET pour la vue de detail (garde anti-IDOR : les tables intranet_* ont la
// RLS off et l'app ecrit en service_role, la garde est ENTIEREMENT en code).
//
// Passe par le routeur (ADR-001). Degrade proprement : table / colonnes de traitement pas
// encore posees -> file vide ou tout « a traiter », jamais une page cassee.

import { getRecapAgRepository } from "@/lib/adapters/router";
import {
  getCoproDuPerimetre,
  getCoprosDuPerimetre,
  type PerimetreUtilisateur,
} from "@/lib/services/coproprietes/copros-du-perimetre";
import type { RecapAgDetail, RecapAgFileLigne } from "@/lib/ports/recap-ag-repository";

/** Ligne de file : le recap + le nom de la copro (le port ne connait que son code). */
export interface RecapRecu extends RecapAgFileLigne {
  coproNom: string;
}

/** Note de travail complete : le recap + le nom de la copro. */
export interface RecapRecuDetail extends RecapAgDetail {
  coproNom: string;
}

export interface FileRecapsRecus {
  aTraiter: RecapRecu[];
  traites: RecapRecu[];
}

const FILE_VIDE: FileRecapsRecus = { aTraiter: [], traites: [] };

/**
 * Les recaps du perimetre de l'utilisateur, separes « a traiter » / « traites », les plus
 * recents d'abord. Un recap dont la copro n'est pas dans le perimetre est ecarte - et une
 * copro qu'on ne sait pas resoudre l'est aussi (on n'affiche jamais par defaut).
 */
export async function listerRecapsRecus(
  params: PerimetreUtilisateur,
  limite = 100,
): Promise<FileRecapsRecus> {
  try {
    const [recaps, copros] = await Promise.all([
      getRecapAgRepository().listerRecapsPourFile(limite),
      getCoprosDuPerimetre(params),
    ]);
    const nomParCode = new Map(copros.map((c) => [c.code, c.nom]));

    const lignes: RecapRecu[] = recaps
      .filter((r) => nomParCode.has(r.coproCode))
      .map((r) => ({ ...r, coproNom: nomParCode.get(r.coproCode) as string }));

    return {
      aTraiter: lignes.filter((r) => !r.traiteLe),
      traites: lignes.filter((r) => Boolean(r.traiteLe)),
    };
  } catch (err) {
    console.warn("[recaps-recus] file indisponible :", (err as Error).message);
    return FILE_VIDE;
  }
}

/**
 * Un recap complet, si la copro est dans le perimetre de l'utilisateur - sinon null
 * (garde anti-IDOR : deviner l'URL d'un recap d'une autre agence ne doit rien ouvrir).
 */
export async function getRecapRecu(
  recapId: string,
  params: PerimetreUtilisateur,
): Promise<RecapRecuDetail | null> {
  let recap: RecapAgDetail | null;
  try {
    recap = await getRecapAgRepository().getRecapAg(recapId);
  } catch (err) {
    console.warn(`[recaps-recus] recap ${recapId} illisible :`, (err as Error).message);
    return null;
  }
  if (!recap) return null;

  const copro = await getCoproDuPerimetre(recap.coproCode, params);
  if (!copro) return null;
  return { ...recap, coproNom: copro.nom };
}

/**
 * Marque le recap traite (ou le remet a traiter). MEME garde de perimetre que la lecture :
 * l'ecriture ne se contente pas de l'UI, elle revalide cote serveur.
 *
 * L'erreur remonte volontairement a l'appelant (colonnes de traitement pas encore posees,
 * base indisponible...) : un marquage qui echoue en silence afficherait un succes mensonger.
 */
export async function marquerRecapTraite(
  recapId: string,
  traite: boolean,
  par: string,
  params: PerimetreUtilisateur,
): Promise<void> {
  const recap = await getRecapAgRepository().getRecapAg(recapId);
  if (!recap) throw new Error("Récap introuvable.");
  if (!(await getCoproDuPerimetre(recap.coproCode, params))) {
    throw new Error("Ce récap ne relève pas de votre périmètre.");
  }
  await getRecapAgRepository().marquerTraite(recapId, traite, par);
}
