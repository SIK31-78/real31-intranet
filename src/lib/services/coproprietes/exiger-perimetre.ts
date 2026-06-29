// Garde de cloisonnement au niveau SERVICE (defense en profondeur, E1). Les Server
// Actions verifient deja le perimetre avant de muter, mais si une future action oublie
// le check, le service refuse quand meme : une ecriture ne part jamais sur une copro
// hors du perimetre du gestionnaire. No-op en mock (COPRO_SOURCE != supabase), comme
// les actions - sinon le dev/mock casse. coproAppartient est memoise (React.cache),
// donc le check action + le check service ne coutent qu'une seule requete par requete.

import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";

export async function exigerPerimetre(coproCode: string, managerId: string): Promise<void> {
  if (process.env.COPRO_SOURCE !== "supabase") return; // mock : pas de cloisonnement
  if (!(await coproAppartient(coproCode, managerId))) {
    throw new Error("Copropriété hors du périmètre du gestionnaire.");
  }
}
