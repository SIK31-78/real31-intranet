import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMesEvenements } from "@/lib/services/mes-evenements/get-mes-evenements";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { MesEvenementsVue } from "@/components/mes-evenements/mes-evenements-vue";

export const metadata: Metadata = { title: "Mes événements - REAL31 Intranet" };

// Lit la vraie data (copros + jalons) : rendu a la demande, jamais prerendu statique.
export const dynamic = "force-dynamic";

export default async function MesEvenementsPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const data = await getMesEvenements(g);

  return (
    <AppShell user={g} active="evenements" breadcrumb="Mes événements">
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <MesEvenementsVue data={data} />
      </div>
    </AppShell>
  );
}
