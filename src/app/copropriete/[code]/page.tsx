import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFicheCopro } from "@/lib/services/fiche-copro/get-fiche-copro";
import { AppShell } from "@/components/layout/app-shell";
import { FicheCoproVue } from "@/components/fiche-copro/fiche-copro-vue";

export const metadata: Metadata = {
  title: "Fiche copropriété — REAL31 Intranet",
};

// Mock session : meme ancre que les autres ecrans (cf. dashboard, calendrier, supervision).
const GESTIONNAIRE = { id: "el", nomComplet: "Élise Lambert", initiales: "EL" };
const AUJOURDHUI_ISO = "2026-05-27";

export default async function CoproprietePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const fiche = await getFicheCopro(code, GESTIONNAIRE.id, AUJOURDHUI_ISO);
  if (!fiche) notFound();

  return (
    <AppShell
      user={GESTIONNAIRE}
      active="copros"
      breadcrumb={`Copropriétés · ${fiche.copro.code}`}
    >
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <FicheCoproVue fiche={fiche} />
      </div>
    </AppShell>
  );
}
