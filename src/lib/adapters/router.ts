// Routeur d'adapters : SEUL endroit autorise a connaitre un adapter concret.
// La regle ESLint boundaries (cf. ADR-001) interdit aux services et a l'UI
// d'importer directement un adapter ; ils passent par ce routeur.
//
// Tant qu'on est en donnees mockees, on renvoie toujours les adapters mock.
// Quand Supabase / eStale arriveront, le choix de l'adapter se fera ICI
// (selon copros.source, env, etc.), sans toucher aux services ni aux composants.

import type { DashboardProvider } from "@/lib/ports/dashboard-provider";
import type { CalendrierProvider } from "@/lib/ports/calendrier-provider";
import type { SupervisionAgProvider } from "@/lib/ports/supervision-ag-provider";
import type { CoproRepository } from "@/lib/ports/copro-repository";
import type { CondoEstaleProvider } from "@/lib/ports/condo-estale-provider";
import type { MesEvenementsProvider } from "@/lib/ports/mes-evenements-provider";
import { MockDashboardProvider } from "@/lib/adapters/mock/mock-dashboard-provider";
import { MockCalendrierProvider } from "@/lib/adapters/mock/mock-calendrier-provider";
import { MockSupervisionAgProvider } from "@/lib/adapters/mock/mock-supervision-ag-provider";
import { MockCoproRepository } from "@/lib/adapters/mock/mock-copro-repository";
import { MockCondoEstaleProvider } from "@/lib/adapters/mock/mock-condo-estale-provider";
import { MockMesEvenementsProvider } from "@/lib/adapters/mock/mock-mes-evenements-provider";
import { SupabaseCoproRepository } from "@/lib/adapters/supabase/supabase-copro-repository";
import type { JalonRepository } from "@/lib/ports/jalon-repository";
import { SupabaseJalonRepository } from "@/lib/adapters/supabase/supabase-jalon-repository";
import { MockJalonRepository } from "@/lib/adapters/mock/mock-jalon-repository";
import { SupabaseSupervisionAgRepository } from "@/lib/adapters/supabase/supabase-supervision-ag-repository";
import type { GestionnaireRepository } from "@/lib/ports/gestionnaire-repository";
import { SupabaseGestionnaireRepository } from "@/lib/adapters/supabase/supabase-gestionnaire-repository";
import { MockGestionnaireRepository } from "@/lib/adapters/mock/mock-gestionnaire-repository";
import type { OdjRepository } from "@/lib/ports/odj-repository";
import { SupabaseOdjRepository } from "@/lib/adapters/supabase/supabase-odj-repository";
import { MockOdjRepository } from "@/lib/adapters/mock/mock-odj-repository";
import { checkDbHealth, type DbHealth } from "@/lib/adapters/supabase/health";
import { EstaleCondoProvider } from "@/lib/adapters/estale/estale-condo-provider";
import { estaleConfigure } from "@/lib/adapters/estale/client";

export type { DbHealth };

export function getDashboardProvider(): DashboardProvider {
  return new MockDashboardProvider();
}

export function getCalendrierProvider(): CalendrierProvider {
  return new MockCalendrierProvider();
}

// Supervision AG. En reel : etat persiste dans intranet_supervision_items (id
// composite CODE__DATE). En mock : STORE module-level dans l'adapter.
export function getSupervisionAgProvider(): SupervisionAgProvider {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseSupervisionAgRepository();
  return new MockSupervisionAgProvider();
}

// Referentiel copro. Bascule par env COPRO_SOURCE :
//   - "supabase" -> lit la vraie data public.Copropriete (App A) en lecture seule ;
//   - sinon       -> donnees mockees (defaut).
export function getCoproRepository(): CoproRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseCoproRepository();
  return new MockCoproRepository();
}

// Etat des jalons (table native intranet_jalons). Meme bascule que le referentiel.
export function getJalonRepository(): JalonRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseJalonRepository();
  return new MockJalonRepository();
}

// Donnees copro sourcees eStale (CS, historique AG). Branche en reel (Phase B,
// ADR-022) quand les identifiants eStale sont presents ; sinon mock.
export function getCondoEstaleProvider(): CondoEstaleProvider {
  if (process.env.COPRO_SOURCE === "supabase" && estaleConfigure()) {
    return new EstaleCondoProvider();
  }
  return new MockCondoEstaleProvider();
}

// Vue agregee "Mes evenements". Cote reel, ce sera un service composant jalons +
// evenements + referentiel ; pour l'instant un agregat mocke.
export function getMesEvenementsProvider(): MesEvenementsProvider {
  return new MockMesEvenementsProvider();
}

// Etat de l'ODJ (saisies du gestionnaire + points legaux retires). En reel :
// table native intranet_odj_champs.
export function getOdjRepository(): OdjRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseOdjRepository();
  return new MockOdjRepository();
}

// Gestionnaires (cloisonnement). Source cible : public."User" via les managerId.
export function getGestionnaireRepository(): GestionnaireRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseGestionnaireRepository();
  return new MockGestionnaireRepository();
}

// Health check BDD (lecture cabinet_settings via service_role).
export async function getDbHealth(): Promise<DbHealth> {
  return checkDbHealth();
}
