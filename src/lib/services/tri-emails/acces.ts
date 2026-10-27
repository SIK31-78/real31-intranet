// La boite triee d'un collaborateur (ADR-046, V2 du 27/10/2026) : celle de la config
// (MAIL_TRI_BOITES) dont les agences contiennent l'agence du collaborateur, ou aucune. Une
// personne est sur une seule agence (pas de delegation en V2), donc sur une seule boite.
//
// Qui trie : l'equipe syndic de l'agence (gestionnaires, assistants, direction) et les
// super-admins, qui choisissent la boite (`?boite=` sur l'ecran). estSuperAdmin et
// estEquipeSyndic vivent dans auth, que les services n'importent pas : les appelants (pages,
// actions, app-shell) les calculent et les passent ici (DroitsTri). Les binomes (qui recoit
// quoi) restent au super-admin.

import { boitesTri, boiteTriDeLAgence, type BoiteTriConfig } from "@/lib/domain/mail-gate";
import { codeAgence } from "@/lib/services/agences/resoudre-agence";

/** Ce que l'appelant sait des droits de la personne (auth). */
export interface DroitsTri {
  superAdmin: boolean;
  /** Gestionnaire, assistant ou direction (estEquipeSyndic). */
  equipeSyndic: boolean;
}

/** La boite triee de l'agence du collaborateur, ou null (agence inconnue, ou pas de boite). */
export async function boiteDe(g: { agencyId?: string | null }): Promise<BoiteTriConfig | null> {
  const agence = await codeAgence(g.agencyId).catch(() => undefined);
  return boiteTriDeLAgence(agence);
}

/**
 * La boite que cette personne trie, ou null (pas d'acces). Super-admin : la boite demandee si
 * elle est dans la config, sinon la premiere ; une boite demandee hors config = null. Les
 * autres : leur boite, s'ils sont de l'equipe syndic ; une autre boite demandee = null.
 */
export async function boiteTriAccessible(
  g: { agencyId?: string | null },
  droits: DroitsTri,
  demandee?: string | null,
): Promise<BoiteTriConfig | null> {
  const voulue = (demandee ?? "").trim().toLowerCase();
  if (droits.superAdmin) {
    const boites = boitesTri();
    return voulue ? (boites.find((b) => b.boite === voulue) ?? null) : (boites[0] ?? null);
  }
  if (!droits.equipeSyndic) return null;
  const sienne = await boiteDe(g);
  if (!sienne || (voulue && voulue !== sienne.boite)) return null;
  return sienne;
}
