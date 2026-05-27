// Routeur d'adapters : SEUL endroit autorise a connaitre un adapter concret.
// La regle ESLint boundaries (cf. ADR-001) interdit aux services et a l'UI
// d'importer directement un adapter ; ils passent par ce routeur.
//
// Tant qu'on est en donnees mockees, on renvoie toujours les adapters mock.
// Quand Supabase / eStale arriveront, le choix de l'adapter se fera ICI
// (selon copros.source, env, etc.), sans toucher aux services ni aux composants.

import type { DashboardProvider } from "@/lib/ports/dashboard-provider";
import type { CalendrierProvider } from "@/lib/ports/calendrier-provider";
import { MockDashboardProvider } from "@/lib/adapters/mock/mock-dashboard-provider";
import { MockCalendrierProvider } from "@/lib/adapters/mock/mock-calendrier-provider";

export function getDashboardProvider(): DashboardProvider {
  return new MockDashboardProvider();
}

export function getCalendrierProvider(): CalendrierProvider {
  return new MockCalendrierProvider();
}
