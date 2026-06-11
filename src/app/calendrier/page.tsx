import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getEvenements } from "@/lib/services/calendrier/get-calendrier";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { CalendrierVue } from "@/components/calendrier/calendrier-vue";

export const metadata: Metadata = { title: "Calendrier AG/CS - REAL31 Intranet" };

// Lit la vraie data en mode supabase : rendu a la demande.
export const dynamic = "force-dynamic";

export default async function CalendrierPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  // Vraie data : aujourd'hui reel ; mock : ancre calee sur les donnees mockees (2026-05-27).
  const aujourdhuiISO =
    process.env.COPRO_SOURCE === "supabase"
      ? new Date().toISOString().slice(0, 10)
      : "2026-05-27";
  const evenements = await getEvenements(g.id);

  return (
    <AppShell user={g} active="calendrier" breadcrumb="Calendrier AG/CS">
      <div className="mx-auto max-w-[1400px] px-8 py-8">
        <div className="mb-5">
          <h1 className="text-[20px] font-medium tracking-tight text-ink">
            Calendrier AG/CS
          </h1>
          <p className="text-[13px] text-ink-3 mt-0.5">
            Vue d&apos;ensemble de vos assemblees et conseils syndicaux.
          </p>
        </div>
        <CalendrierVue evenements={evenements} aujourdhuiISO={aujourdhuiISO} />
      </div>
    </AppShell>
  );
}
