import type { Metadata } from "next";
import { getMesEvenements } from "@/lib/services/mes-evenements/get-mes-evenements";
import { AppShell } from "@/components/layout/app-shell";
import { MesEvenementsVue } from "@/components/mes-evenements/mes-evenements-vue";

export const metadata: Metadata = { title: "Mes événements - REAL31 Intranet" };

// Lit la vraie data (copros + jalons) : rendu a la demande, jamais prerendu statique.
export const dynamic = "force-dynamic";

// Mock session : meme ancre que les autres ecrans.
const GESTIONNAIRE = { id: "el", nomComplet: "Élise Lambert", initiales: "EL" };

export default async function MesEvenementsPage() {
  const data = await getMesEvenements(GESTIONNAIRE.id);

  return (
    <AppShell user={GESTIONNAIRE} active="evenements" breadcrumb="Mes événements">
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <MesEvenementsVue data={data} />
      </div>
    </AppShell>
  );
}
