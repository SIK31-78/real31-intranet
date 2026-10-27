// Qui trie la boite generique (ADR-046). Pilote super-admin jusqu'au 27/10/2026 ; ouvert
// depuis a toute l'agence de la boite (MAIL_TRI_AGENCE, ex. HLS pour syndic4) : c'est son
// courrier. Les appelants ajoutent les super-admins (estSuperAdmin vit dans auth, que les
// services n'importent pas). Les binomes (qui recoit quoi) restent au super-admin.

import { codeAgence } from "@/lib/services/agences/resoudre-agence";

/** Le collaborateur est-il de l'agence de la boite du tri ? */
export async function deLAgenceDuTri(agencyId: string | undefined): Promise<boolean> {
  const agence = (process.env.MAIL_TRI_AGENCE ?? "").trim().toUpperCase();
  if (!agence) return false;
  return ((await codeAgence(agencyId).catch(() => undefined)) ?? "").toUpperCase() === agence;
}
