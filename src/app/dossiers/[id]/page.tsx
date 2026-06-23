import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDossier } from "@/lib/services/dossiers/get-dossiers";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { DossierFiche } from "@/components/dossiers/dossier-fiche";

export const metadata: Metadata = { title: "Dossier - REAL31 Intranet" };

export const dynamic = "force-dynamic";

export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const dossier = await getDossier(id, g.id);
  if (!dossier) notFound();

  return (
    <AppShell user={g} active="dossiers" breadcrumb={`Dossier - ${dossier.titre}`}>
      <div className="mx-auto max-w-[900px] px-8 py-8">
        <DossierFiche dossier={dossier} />
      </div>
    </AppShell>
  );
}
