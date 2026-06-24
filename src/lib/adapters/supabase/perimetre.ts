// Perimetre d'acces (cloisonnement) d'un utilisateur sur public."Copropriete".
//
// Un user voit/agit sur les copros qu'il GERE (managerId) OU qu'il ASSISTE
// (assistantId) : un gestionnaire voit ses copros, un assistant voit celles qu'il
// assiste. Le meme id technique (public."User".id) sert dans les deux colonnes.
//
// Renvoie une chaine de filtre PostgREST a passer a `.or(...)` :
//   q.or(filtrePerimetre(userId))  ==  (managerId = userId OU assistantId = userId)
//
// L'etat natif (jalons, supervision) est cle par COPRO, pas par redacteur -> une fois
// l'acces a la copro accorde, manager et assistant partagent la meme fiche.
export function filtrePerimetre(userId: string): string {
  return `managerId.eq.${userId},assistantId.eq.${userId}`;
}
