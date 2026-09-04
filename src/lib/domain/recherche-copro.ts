// Recherche de copropriete (palette Ctrl+K / barre "Rechercher une copro") : projection
// des copros consultables + filtre de saisie. Domaine PUR (ADR-001) : aucune I/O, donc
// teste offline - le filtre etait jusqu'ici noye dans le composant client.
//
// POURQUOI CE MODULE (plainte Emmanuel LOPES) : "la recherche ne fonctionne que sur mes
// copros, pas celles de toute l'equipe". La palette filtrait une liste deja cloisonnee au
// PORTEFEUILLE ; chercher la copro d'une collegue ne donnait rien - sans message, comme si
// elle n'existait pas. La liste vient desormais du perimetre de LECTURE (le cabinet, cf.
// services/coproprietes/perimetre-lecture), donc elle contient les copros des autres :
// chaque resultat doit dire CHEZ QUI on regarde, sinon on croit ouvrir la sienne.

import type { Copropriete } from "@/lib/domain/copropriete";

export interface CoproRecherche {
  code: string;
  nom: string;
  ville: string;
  /**
   * Gestionnaire de la copro - renseigne SEULEMENT quand la copro n'est PAS dans le
   * portefeuille de l'utilisateur. Sur ses propres copros la mention serait du bruit
   * (il sait qu'elles sont a lui) ; sur celles des autres, c'est l'information qui
   * manque aujourd'hui.
   */
  gestionnaire?: string;
}

/**
 * Projette les copros du perimetre de LECTURE en resultats de recherche, en marquant le
 * gestionnaire de celles qui ne sont pas dans `codesPortefeuille` (le perimetre d'ECRITURE
 * de l'utilisateur : ses copros gerees ou assistees).
 */
export function projeterRecherche(
  copros: Copropriete[],
  codesPortefeuille: ReadonlySet<string>,
): CoproRecherche[] {
  return copros.map((c) => {
    const gestionnaire = c.equipe.find((m) => m.role === "gestionnaire")?.nomComplet;
    return {
      code: c.code,
      nom: c.nom,
      ville: c.adresse?.ville ?? "",
      ...(gestionnaire && !codesPortefeuille.has(c.code) ? { gestionnaire } : {}),
    };
  });
}

/**
 * Filtre de saisie : TOUS les termes doivent apparaitre (recherche "et", insensible a la
 * casse) dans le code, le nom, la ville ou le gestionnaire. Chercher le NOM D'UNE COLLEGUE
 * remonte donc ses copros - c'est exactement la question posee ("la copro que Fanny gere").
 * Resultat borne : une palette n'est pas une liste, elle propose.
 */
export function filtrerRecherche(
  copros: CoproRecherche[],
  requete: string,
  limite = 8,
): CoproRecherche[] {
  const termes = requete.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (termes.length === 0) return [];
  return copros
    .filter((c) => {
      const foin = `${c.code} ${c.nom} ${c.ville} ${c.gestionnaire ?? ""}`.toLowerCase();
      return termes.every((t) => foin.includes(t));
    })
    .slice(0, limite);
}
