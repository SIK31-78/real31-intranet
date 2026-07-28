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
  const vue = await getDossier(id, g.id);
  if (!vue) notFound();

  // Les dossiers vivent sur l'accueil : pas d'entree sidebar propre -> on surligne "Accueil".
  return (
    <AppShell user={g} active="accueil" breadcrumb={`Dossier - ${vue.dossier.titre}`}>
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 md:px-8 md:py-8">
        <DossierFiche
          dossier={vue.dossier}
          gestionnaire={vue.gestionnaire}
          assistant={vue.assistant}
          monInitiales={g.initiales}
        />
      </div>
    </AppShell>
  );
}
