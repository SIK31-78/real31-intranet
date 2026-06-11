// Service : la copro `code` appartient-elle au gestionnaire `managerId` ? Sert a
// cloisonner les ECRITURES (les actions verifient avant de muter). Passe par le
// routeur (findByCode renvoie null si hors scope).

import { getCoproRepository } from "@/lib/adapters/router";

export async function coproAppartient(code: string, managerId: string): Promise<boolean> {
  return (await getCoproRepository().findByCode(code, managerId)) !== null;
}
