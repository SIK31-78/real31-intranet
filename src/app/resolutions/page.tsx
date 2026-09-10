import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getBibliotheque } from "@/lib/services/resolutions/get-bibliotheque";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { BibliothequeVue } from "@/components/resolutions/bibliotheque-vue";
import { Page } from "@/components/ui/page";

export const metadata: Metadata = { title: "Résolutions - REAL31 Intranet" };

// Lit la motion bank Estale a la demande.
export const dynamic = "force-dynamic";

export default async function ResolutionsPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const data = await getBibliotheque();

  return (
    <AppShell user={g} active="resolutions" breadcrumb="Résolutions">
      <Page largeur="travail">
        <BibliothequeVue data={data} />
      </Page>
    </AppShell>
  );
}
