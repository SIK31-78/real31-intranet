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
import { MockDashboardProvider } from "@/lib/adapters/mock/mock-dashboard-provider";
import { MockCalendrierProvider } from "@/lib/adapters/mock/mock-calendrier-provider";
import { MockSupervisionAgProvider } from "@/lib/adapters/mock/mock-supervision-ag-provider";
import { MockCoproRepository } from "@/lib/adapters/mock/mock-copro-repository";
import { MockCondoEstaleProvider } from "@/lib/adapters/mock/mock-condo-estale-provider";
import { checkDbHealth, type DbHealth } from "@/lib/adapters/supabase/health";

export type { DbHealth };

export function getDashboardProvider(): DashboardProvider {
  return new MockDashboardProvider();
}

export function getCalendrierProvider(): CalendrierProvider {
  return new MockCalendrierProvider();
}

// Note : le STORE de mutations vit au module-level dans l'adapter (cf. fichier),
// donc instancier ici a chaque appel est sans effet sur la persistance.
export function getSupervisionAgProvider(): SupervisionAgProvider {
  return new MockSupervisionAgProvider();
}

// Referentiel copro. Source cible : App A (public.Copropriete), lue via un adapter.
export function getCoproRepository(): CoproRepository {
  return new MockCoproRepository();
}

// Donnees copro sourcees eStale (CS, historique AG, conformite). Source cible : eStale
// (GraphQL), branchee en J4 -> le choix de l'adapter se fera ICI, sans toucher au service.
export function getCondoEstaleProvider(): CondoEstaleProvider {
  return new MockCondoEstaleProvider();
}

// Health check BDD (lecture cabinet_settings via service_role).
export async function getDbHealth(): Promise<DbHealth> {
  return checkDbHealth();
}
