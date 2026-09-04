// Service : « ce récap, c'est fait » - le marquage cote GESTIONNAIRE, depuis l'écran
// « Récap AG ». Pendant du `marquerRecapTraite` du pole comptable, avec la MEME garde de
// perimetre (les tables intranet_* ont la RLS off, la garde est entierement en code).
//
// Deux boucles distinctes et volontairement separees : le comptable ferme la sienne dans
// la file « Récaps d'AG reçus », le gestionnaire ferme la sienne ici. Cf. le port
// (MarquageEffectue vs TraitementComptable) et supabase/sql/intranet_recap_ag_effectue.sql.
//
// L'erreur remonte a l'appelant (colonnes pas encore posees, base indisponible...) : un
// marquage qui echoue en silence afficherait un succes mensonger.

import { getRecapAgRepository } from "@/lib/adapters/router";
import {
  getCoproDuPerimetre,
  type PerimetreUtilisateur,
} from "@/lib/services/coproprietes/copros-du-perimetre";

export async function marquerRecapEffectue(
  recapId: string,
  effectue: boolean,
  par: string,
  params: PerimetreUtilisateur,
): Promise<void> {
  const repo = getRecapAgRepository();
  const recap = await repo.getRecapAg(recapId);
  if (!recap) throw new Error("Récap introuvable.");
  if (!(await getCoproDuPerimetre(recap.coproCode, params))) {
    throw new Error("Ce récap ne relève pas de votre périmètre.");
  }
  await repo.marquerEffectue(recapId, effectue, par);
}
