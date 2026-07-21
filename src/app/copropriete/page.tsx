import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCoprosPilotage } from "@/lib/services/coproprietes/get-copros-pilotage";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutVoirToutesLesCopros } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { CoprosVue } from "@/components/coproprietes/copros-vue";
import { ETAT_CYCLE_ORDRE, type EtatCycle } from "@/lib/domain/etat-cycle-ag";

export const metadata: Metadata = { title: "Toutes les copropriétés - REAL31 Intranet" };

// Lit la vraie data : rendu a la demande, jamais prerendu statique.
export const dynamic = "force-dynamic";

export default async function CoproprietesPage({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string }>;
}) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  // Encadrement / compta / super-admin : vue TRANSVERSE (toutes les copros, dont les eStale
  // gerees par d'autres et S297 sans gestionnaire). Un gestionnaire ne voit que son portefeuille.
  const managerId = peutVoirToutesLesCopros(g.email, g.role) ? undefined : g.id;
  const copros = await getCoprosPilotage(managerId);
  const { etat } = await searchParams;
  const etatInitial = ETAT_CYCLE_ORDRE.includes(etat as EtatCycle) ? (etat as EtatCycle) : undefined;

  return (
    <AppShell user={g} active="copros" breadcrumb="Copropriétés">
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <h1 className="text-[20px] font-medium tracking-tight text-ink mb-4">Toutes les copropriétés</h1>
        <CoprosVue copros={copros} etatInitial={etatInitial} />
      </div>
    </AppShell>
  );
}
