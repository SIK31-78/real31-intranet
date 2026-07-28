import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOdj } from "@/lib/services/odj/get-odj";
import { getBibliotheque } from "@/lib/services/resolutions/get-bibliotheque";
import { getAssemblee } from "@/lib/services/odj/get-assemblee";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { ComposerOdj } from "@/components/odj/composer-odj";

export const metadata: Metadata = { title: "Mode CS - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function ComposerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  // getOdj resout la copro + la date d'AG (et cloisonne par gestionnaire).
  const odj = await getOdj(id, g.id);
  if (!odj) notFound();
  const [data, assemblee] = await Promise.all([getBibliotheque(), getAssemblee(odj.copro.code)]);

  return (
    <AppShell user={g} active="resolutions" breadcrumb={`Mode CS - ${odj.copro.nom}`}>
      <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 md:px-8 md:py-8">
        <ComposerOdj copro={odj.copro} dateAg={odj.dateAg} data={data} assemblee={assemblee} />
      </div>
    </AppShell>
  );
}
