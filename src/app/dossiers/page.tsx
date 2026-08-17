import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDossiers } from "@/lib/services/dossiers/get-dossiers";
import { getCoproprietes } from "@/lib/services/coproprietes/get-coproprietes";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { DossiersVue } from "@/components/dossiers/dossiers-vue";

export const metadata: Metadata = { title: "Dossiers - REAL31 Intranet" };

export const dynamic = "force-dynamic";

export default async function DossiersPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const [dossiers, copros] = await Promise.all([getDossiers(g.id), getCoproprietes(g.id)]);
  const listeCopros = copros.map((c) => ({ code: c.code, nom: c.nom }));

  return (
    <AppShell user={g} active="dossiers" breadcrumb="Dossiers">
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 md:px-8 md:py-8">
        <h1 className="text-[20px] font-medium tracking-tight text-ink mb-4">Dossiers</h1>
        <DossiersVue dossiers={dossiers} copros={listeCopros} />
      </div>
    </AppShell>
  );
}
