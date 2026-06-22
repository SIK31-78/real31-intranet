import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDashboard } from "@/lib/services/dashboard/get-dashboard";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { PipelineAg } from "@/components/dashboard/pipeline-ag";
import { ResumeAttention } from "@/components/dashboard/resume-attention";
import { FluxActivite } from "@/components/dashboard/flux-activite";

export const metadata: Metadata = { title: "Dashboard - REAL31 Intranet" };

// Lit la vraie data en mode supabase : rendu a la demande.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const data = await getDashboard(g);

  return (
    <AppShell user={data.gestionnaire} active="dashboard" breadcrumb="Dashboard">
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <DashboardHeader gestionnaire={data.gestionnaire} dateCourante={data.dateCourante} />

        {data.pipeline && (
          <div className="mt-6">
            <PipelineAg pipeline={data.pipeline} />
          </div>
        )}

        <div className="grid gap-6 mt-6 grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
          <ResumeAttention items={data.attention} />
          <FluxActivite activite={data.activite} />
        </div>
      </div>
    </AppShell>
  );
}
