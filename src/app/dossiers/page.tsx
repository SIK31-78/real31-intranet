import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDossiers } from "@/lib/services/dossiers/get-dossiers";
import { getCoproprietes } from "@/lib/services/coproprietes/get-coproprietes";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { DossiersVue } from "@/components/dossiers/dossiers-vue";
import { Page, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = { title: "Dossiers - REAL31 Intranet" };

export const dynamic = "force-dynamic";

export default async function DossiersPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const [dossiers, copros] = await Promise.all([getDossiers(g.id), getCoproprietes(g.id)]);
  const listeCopros = copros.map((c) => ({ code: c.code, nom: c.nom }));

  return (
    <AppShell user={g} active="dossiers" breadcrumb="Dossiers">
      <Page largeur="travail">
        <PageHeader titre="Dossiers" meta={`${dossiers.length} dossier${dossiers.length > 1 ? "s" : ""}`} />
        <DossiersVue dossiers={dossiers} copros={listeCopros} />
      </Page>
    </AppShell>
  );
}
