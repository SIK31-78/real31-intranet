import type { Metadata } from "next";
import { getEvenements } from "@/lib/services/calendrier/get-calendrier";
import { AppShell } from "@/components/layout/app-shell";
import { CalendrierVue } from "@/components/calendrier/calendrier-vue";

export const metadata: Metadata = { title: "Calendrier AG/CS — REAL31 Intranet" };

// Mock session : ancre temporelle calee sur les donnees du mock adapter (2026-05-27).
// A remplacer quand l'auth/horloge arrive en increment dedie.
const GESTIONNAIRE = { id: "el", nomComplet: "Élise Lambert", initiales: "EL" };
const AUJOURDHUI_ISO = "2026-05-27";

export default async function CalendrierPage() {
  const evenements = await getEvenements(GESTIONNAIRE.id);

  return (
    <AppShell user={GESTIONNAIRE} active="calendrier" breadcrumb="Calendrier AG/CS">
      <div className="mx-auto max-w-[1400px] px-8 py-8">
        <div className="mb-5">
          <h1 className="text-[20px] font-medium tracking-tight text-ink">
            Calendrier AG/CS
          </h1>
          <p className="text-[13px] text-ink-3 mt-0.5">
            Vue d&apos;ensemble de vos assemblees et conseils syndicaux.
          </p>
        </div>
        <CalendrierVue evenements={evenements} aujourdhuiISO={AUJOURDHUI_ISO} />
      </div>
    </AppShell>
  );
}
