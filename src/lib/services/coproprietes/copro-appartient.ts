// Service : la copro `code` appartient-elle au gestionnaire `managerId` ? Sert a
// cloisonner les ECRITURES (les actions verifient avant de muter). Passe par le
// routeur (findByCode renvoie null si hors scope).

import { cache } from "react";
import { getCoproRepository } from "@/lib/adapters/router";

// Memoise par requete (React.cache) : le meme (code, managerId) n'interroge la base
// qu'une fois, meme si l'action ET le service (exigerPerimetre) le verifient tous deux.
export const coproAppartient = cache(async (code: string, managerId: string): Promise<boolean> => {
  return (await getCoproRepository().findByCode(code, managerId)) !== null;
});
