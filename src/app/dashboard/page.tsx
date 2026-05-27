import type { Metadata } from "next";
import { getDashboard } from "@/lib/services/dashboard/get-dashboard";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ListeAttention } from "@/components/dashboard/liste-attention";
import { FluxActivite } from "@/components/dashboard/flux-activite";

export const metadata: Metadata = { title: "Dashboard — REAL31 Intranet" };

export default async function DashboardPage() {
  const data = await getDashboard("el");

  return (
    <AppShell user={data.gestionnaire} active="dashboard" breadcrumb="Dashboard">
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <DashboardHeader gestionnaire={data.gestionnaire} dateCourante={data.dateCourante} />

        <div className="grid gap-4 mt-6 grid-cols-1 sm:grid-cols-3">
          {data.compteurs.map((compteur) => (
            <KpiCard key={compteur.id} compteur={compteur} />
          ))}
        </div>

        <div className="grid gap-6 mt-6 grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
          <ListeAttention items={data.attention} />
          <FluxActivite activite={data.activite} />
        </div>
      </div>
    </AppShell>
  );
}
