import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getBibliotheque } from "@/lib/services/resolutions/get-bibliotheque";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { BibliothequeVue } from "@/components/resolutions/bibliotheque-vue";

export const metadata: Metadata = { title: "Résolutions - REAL31 Intranet" };

// Lit la motion bank Estale a la demande.
export const dynamic = "force-dynamic";

export default async function ResolutionsPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const data = await getBibliotheque();

  return (
    <AppShell user={g} active="resolutions" breadcrumb="Résolutions">
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 md:px-8 md:py-8">
        <BibliothequeVue data={data} />
      </div>
    </AppShell>
  );
}
