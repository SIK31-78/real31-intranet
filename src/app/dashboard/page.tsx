import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, ArrowRight } from "lucide-react";
import { getDashboard } from "@/lib/services/dashboard/get-dashboard";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estVueComptable } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { AnnoncesPanel } from "@/components/dashboard/annonces-panel";
import { PipelineAg } from "@/components/dashboard/pipeline-ag";
import { ProblemesPanel } from "@/components/dashboard/problemes-panel";

export const metadata: Metadata = { title: "Dashboard - REAL31 Intranet" };

// Lit la vraie data en mode supabase : rendu a la demande.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  // Le comptable pur ne reste jamais sur le dashboard gestionnaire : sa vue est le
  // dashboard comptable. Garantit aussi que tout redirect("/dashboard") ailleurs (gates)
  // la renvoie bien vers /comptabilite.
  if (estVueComptable(g.email, g.role)) redirect("/comptabilite");
  const data = await getDashboard(g);

  return (
    <AppShell user={data.gestionnaire} active="dashboard" breadcrumb="Dashboard">
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <DashboardHeader gestionnaire={data.gestionnaire} dateCourante={data.dateCourante} />

        <div className="mt-5">
          <AnnoncesPanel />
        </div>

        {data.aPrendreEnMain ? (
          <Link
            href="/copropriete"
            className="mt-5 flex items-center gap-2.5 rounded-md border border-warn-500/30 bg-warn-50 px-4 py-2.5 text-[13px] text-warn-700 hover:border-warn-500/50 transition-colors"
          >
            <ClipboardCheck strokeWidth={1.5} className="w-4 h-4 shrink-0" />
            <span className="flex-1">
              <strong>{data.aPrendreEnMain}</strong> copropriété{data.aPrendreEnMain > 1 ? "s" : ""} à prendre en
              main - vérifie les dates héritées avant qu&apos;elles n&apos;entrent dans ton cockpit.
            </span>
            <ArrowRight strokeWidth={1.5} className="w-4 h-4 shrink-0" />
          </Link>
        ) : null}

        {data.pipeline && (
          <div className="mt-6">
            <PipelineAg pipeline={data.pipeline} />
          </div>
        )}

        {/* Vue PORTEFEUILLE : "A faire maintenant" (worklist) et "Actions dossiers" ont
            migre vers l'accueil (bandeau AG + dossiers). Le dashboard garde le pilotage
            agrege (pipeline) + les problemes signales, ici en pleine largeur. */}
        <div className="mt-6">
          <ProblemesPanel problemes={data.problemes ?? []} />
        </div>
      </div>
    </AppShell>
  );
}
