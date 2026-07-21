import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getCoproprietes } from "@/lib/services/coproprietes/get-coproprietes";
import { getRecapAgRepository } from "@/lib/adapters/router";
import { AppShell } from "@/components/layout/app-shell";
import { FormulaireRecapAg } from "@/components/recap-ag/formulaire-recap-ag";
import { HistoriqueRecaps, type RecapAffiche } from "@/components/recap-ag/historique-recaps";

export const metadata: Metadata = { title: "Récap AG - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function RecapAgPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const [copros, historique] = await Promise.all([
    getCoproprietes(g.id),
    getRecapAgRepository().listerRecapsRecents(50),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  const recaps: RecapAffiche[] = historique.map((r) => ({
    id: r.id,
    coproCode: r.coproCode,
    agDate: r.agDate,
    statut: r.statut,
    depassementHeures: r.depassementHeures,
    depassementTtc: r.depassementTtc,
    nbTravaux: r.nbTravaux,
    ...(r.factureId ? { factureId: r.factureId } : {}),
    ...(r.par ? { par: r.par } : {}),
    creeLe: r.creeLe,
  }));

  return (
    <AppShell user={g} active="recap-ag" breadcrumb="Récap AG">
      <div className="mx-auto flex max-w-[1000px] flex-col gap-5 px-8 py-8">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-semibold text-ink">
            <ClipboardList strokeWidth={1.5} className="h-5 w-5 text-green-700" />
            Récap d&apos;assemblée générale
          </h1>
          <p className="mt-1 text-[13px] text-ink-3">
            Le compte-rendu de l&apos;AG une fois tenue : décisions votées, travaux, nouveau
            contrat. Le dépassement horaire est calculé automatiquement et facturé s&apos;il y a
            lieu, au tarif de l&apos;exercice approuvé.
          </p>
        </div>

        <FormulaireRecapAg
          copros={copros
    .map((c) => {
      // Date suggeree du recap = l'AG qui vient d'avoir lieu : la prochaine AG si sa date
      // est deja passee (ou du jour), sinon la derniere AG tenue. Modifiable dans le form.
      const suggeree =
        c.prochaineAg?.date && c.prochaineAg.date <= today ? c.prochaineAg.date : c.derniereAgDate;
      return { code: c.code, nom: c.nom, ...(suggeree ? { agDateSuggeree: suggeree } : {}) };
    })
    .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }))}
          pennylaneActif={Boolean(process.env.PENNYLANE_API_KEY)}
        />

        <HistoriqueRecaps recaps={recaps} />
      </div>
    </AppShell>
  );
}
