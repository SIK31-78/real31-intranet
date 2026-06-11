import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getFicheCopro } from "@/lib/services/fiche-copro/get-fiche-copro";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { FicheCoproVue } from "@/components/fiche-copro/fiche-copro-vue";

export const metadata: Metadata = {
  title: "Fiche copropriété - REAL31 Intranet",
};

export default async function CoproprietePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const aujourdhuiISO =
    process.env.COPRO_SOURCE === "supabase"
      ? new Date().toISOString().slice(0, 10)
      : "2026-05-27";
  const fiche = await getFicheCopro(code, g.id, aujourdhuiISO);
  if (!fiche) notFound();

  return (
    <AppShell
      user={g}
      active="copros"
      breadcrumb={`Copropriétés · ${fiche.copro.code}`}
    >
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <FicheCoproVue fiche={fiche} />
      </div>
    </AppShell>
  );
}
