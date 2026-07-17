// GARDE SERVEUR du module reprise (defense en profondeur).
//
// Le grisage des boutons (ZoneAdminReprise) est une courtoisie d'UI : il ne protege RIEN. Une
// Server Action reste appelable directement (POST forge), une route API aussi. Chaque mutation du
// module reprise passe donc par ce garde, qui verifie DEUX choses dans l'ordre :
//   1. une session (gestionnaire connecte) ;
//   2. le role ADMIN REPRISE (directeur / manager / super-admin) - cf. lib/auth/roles.ts.
//
// Les lectures (suivi, fiche, checklist, journal) N'appellent PAS ce garde : elles restent
// ouvertes a tout gestionnaire authentifie (regle Sekou : le suivi est visible par tous).
//
// PII : le refus ne logue jamais l'email.

import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estAdminReprise, MESSAGE_RESERVE_ADMIN_REPRISE } from "@/lib/auth/roles";

export type GardeReprise =
  | { ok: true; gestionnaire: Gestionnaire }
  | { ok: false; message: string; statut: 401 | 403 };

/**
 * Exige un ADMIN REPRISE connecte. Renvoie le gestionnaire, ou un refus porteur du message a
 * afficher (le meme que l'UI) et du statut HTTP pour les routes API.
 *
 * @param quoi verbe de l'action, pour le message de session expiree ("lancer l'analyse"...).
 */
export async function exigerAdminReprise(quoi = "faire cette action"): Promise<GardeReprise> {
  const gestionnaire = await getGestionnaireCourant();
  if (!gestionnaire) {
    return { ok: false, message: `Session expiree : reconnecte-toi pour ${quoi}.`, statut: 401 };
  }
  if (!estAdminReprise(gestionnaire.email)) {
    return { ok: false, message: MESSAGE_RESERVE_ADMIN_REPRISE, statut: 403 };
  }
  return { ok: true, gestionnaire };
}
