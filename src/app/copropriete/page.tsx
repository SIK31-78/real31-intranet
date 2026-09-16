import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCoprosPilotage, pipelineDepuisCopros } from "@/lib/services/coproprietes/get-copros-pilotage";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estComptable, peutVoirToutesLesCopros } from "@/lib/auth/roles";
import { agencesDuComptable } from "@/lib/domain/perimetre-comptable";
import { getCoprosDuPerimetre } from "@/lib/services/coproprietes/copros-du-perimetre";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { CoprosVue } from "@/components/coproprietes/copros-vue";
import { PipelineAg } from "@/components/dashboard/pipeline-ag";
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
  // Un comptable voit les copros de SES agences (Isabelle -> ML), pas tout le cabinet :
  // meme cadrage que la facturation et la file des recaps (domain/perimetre-comptable).
  const agencesComptable = estComptable(g.email, g.role) ? agencesDuComptable(g.email) : [];
  let copros = await getCoprosPilotage(managerId);
  if (agencesComptable.length > 0) {
    const codes = new Set((await getCoprosDuPerimetre({ managerId: g.id, email: g.email, estComptable: true })).map((c) => c.code));
    copros = copros.filter((c) => codes.has(c.code));
  }
  // Pipeline des AG (compteurs par etat) : resume filtrable de CETTE liste, derive des memes
  // copros deja chargees (aucun second calcul). Chaque compteur pointe vers ?etat= -> filtre
  // la liste en dessous. Ex-bloc du dashboard demantele (Sekou 2026-07-22).
  const pipeline = pipelineDepuisCopros(copros);
  const totalPipeline = pipeline.reduce((s, p) => s + p.count, 0);
  const { etat } = await searchParams;
  const etatInitial = ETAT_CYCLE_ORDRE.includes(etat as EtatCycle) ? (etat as EtatCycle) : undefined;

  return (
    <AppShell user={g} active="copros" breadcrumb="Copropriétés">
      <Page largeur="travail">
        <PageHeader
          titre="Toutes les copropriétés"
          meta={`${copros.length} copropriété${copros.length > 1 ? "s" : ""}${managerId ? " dans votre portefeuille" : agencesComptable.length > 0 ? ` (${agencesComptable.join(", ")})` : " au cabinet"}`}
        />
        {totalPipeline > 0 && <PipelineAg pipeline={pipeline} />}
        <CoprosVue copros={copros} etatInitial={etatInitial} />
      </Page>
    </AppShell>
  );
}
