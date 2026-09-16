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
const ID_RE = /^[A-Za-z0-9-]{1,40}$/;

export function filtrePerimetre(userId: string): string {
  // L'id entre dans un filtre PostgREST : jamais de virgule ni de point (audit 16/09/2026).
  if (!ID_RE.test(userId)) throw new Error(`Identifiant d'utilisateur illisible : « ${userId.slice(0, 40)} ».`);
  return `managerId.eq.${userId},assistantId.eq.${userId}`;
}
