import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getApercuCoffre } from "@/lib/services/coffre/coffre-service";
import { AppShell } from "@/components/layout/app-shell";
import { CoffreVue } from "@/components/coffre/coffre-vue";

export const metadata: Metadata = { title: "Coffre-fort - REAL31 Intranet" };

// Etat propre a l'utilisateur (enrolement, coffres) : rendu a la demande.
export const dynamic = "force-dynamic";

export default async function CoffrePage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const apercu = await getApercuCoffre(g.id);

  return (
    <AppShell user={g} active="coffre" breadcrumb="Coffre-fort">
      <div className="mx-auto max-w-[900px] px-8 py-8">
        <CoffreVue nomComplet={g.nomComplet} apercu={apercu} />
      </div>
    </AppShell>
  );
}
