// PostgREST plafonne chaque reponse a 1 000 lignes, en silence : une lecture « tout »
// sans pagination tronque le jour ou la table depasse le plafond (audit du 16/09/2026 :
// Copropriete a 500, suivi des contrats sans borne du tout). Toute lecture complete passe ici.

export const PAGE_POSTGREST = 1000;

type Reponse = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Lit toutes les lignes d'une requete, page par page. `construire(debut, fin)` doit rendre
 * la requete deja ordonnee de facon deterministe (un tri secondaire sur l'id) et y poser
 * `.range(debut, fin)`.
 */
export async function toutesLesLignes<T>(contexte: string, construire: (debut: number, fin: number) => Reponse): Promise<T[]> {
  const lignes: T[] = [];
  for (let debut = 0; ; debut += PAGE_POSTGREST) {
    const { data, error } = await construire(debut, debut + PAGE_POSTGREST - 1);
    if (error) throw new Error(`${contexte} : ${error.message}`);
    const page = (data ?? []) as T[];
    lignes.push(...page);
    if (page.length < PAGE_POSTGREST) break;
  }
  return lignes;
}
