import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDossier } from "@/lib/services/dossiers/get-dossiers";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { DossierFiche } from "@/components/dossiers/dossier-fiche";
import { Page } from "@/components/ui/page";

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
    <AppShell user={g} active="dossiers" breadcrumb={`Dossier - ${vue.dossier.titre}`}>
      <Page largeur="lecture">
        <DossierFiche
          dossier={vue.dossier}
          gestionnaire={vue.gestionnaire}
          assistant={vue.assistant}
          monInitiales={g.initiales}
        />
      </Page>
    </AppShell>
  );
}
