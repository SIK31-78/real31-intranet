import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMesEvenements } from "@/lib/services/mes-evenements/get-mes-evenements";
import { getProblemes } from "@/lib/services/problemes/get-problemes";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { MesEvenementsVue } from "@/components/mes-evenements/mes-evenements-vue";
import { ProblemesPanel } from "@/components/dashboard/problemes-panel";

export const metadata: Metadata = { title: "Actions - REAL31 Intranet" };

// Lit la vraie data (copros + jalons) : rendu a la demande, jamais prerendu statique.
export const dynamic = "force-dynamic";

export default async function MesEvenementsPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const [data, problemes] = await Promise.all([getMesEvenements(g), getProblemes(g.id)]);

  return (
    <AppShell user={g} active="evenements" breadcrumb="Actions">
      <div className="mx-auto max-w-[1100px] px-8 py-8 flex flex-col gap-6">
        {problemes.length > 0 && <ProblemesPanel problemes={problemes} />}
        <MesEvenementsVue data={data} />
      </div>
    </AppShell>
  );
}
