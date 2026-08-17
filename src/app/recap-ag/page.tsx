import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getCoproprietes } from "@/lib/services/coproprietes/get-coproprietes";
import { listerRecapsEnRetard } from "@/lib/services/compta/recaps-en-retard";
import { getRecapAgRepository } from "@/lib/adapters/router";
import { AppShell } from "@/components/layout/app-shell";
import { AlerteRecapsEnRetard } from "@/components/recap-ag/alerte-recaps-en-retard";
import { FormulaireRecapAg } from "@/components/recap-ag/formulaire-recap-ag";
import { HistoriqueRecaps, type RecapAffiche } from "@/components/recap-ag/historique-recaps";

export const metadata: Metadata = { title: "Récap AG - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function RecapAgPage({
  searchParams,
}: {
  searchParams: Promise<{ copro?: string }>;
}) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const sp = await searchParams;
  // `?copro=S104` : pose par l'alerte des recaps en retard pour ouvrir la saisie sur la
  // bonne copro. Simple defaut d'UI, borne au portefeuille par le select lui-meme.
  const coproInitial =
    typeof sp.copro === "string" && /^[A-Za-z0-9_-]{1,20}$/.test(sp.copro) ? sp.copro : undefined;

  const today = new Date().toISOString().slice(0, 10);
  // Perimetre PORTEFEUILLE, meme cadrage que le select ci-dessous : on n'alerte que sur
  // ce que le gestionnaire peut corriger ICI (un comptable a sa propre vue, /comptabilite/recaps).
  const [copros, historique, enRetard] = await Promise.all([
    getCoproprietes(g.id),
    getRecapAgRepository().listerRecapsRecents(50),
    listerRecapsEnRetard({ managerId: g.id, email: g.email, estComptable: false }, today),
  ]);

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
      <div className="mx-auto flex max-w-[1000px] flex-col gap-5 px-4 py-6 sm:px-6 md:px-8 md:py-8">
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

        {/* En tete : c'est ici que le gestionnaire corrige, donc c'est ici qu'on l'avertit. */}
        <AlerteRecapsEnRetard lignes={enRetard} variante="gestionnaire" />

        <div id="saisie-recap" className="scroll-mt-4">
          <FormulaireRecapAg
            copros={copros
              .map((c) => {
                // Date suggeree du recap = l'AG qui vient d'avoir lieu : la prochaine AG si sa
                // date est deja passee (ou du jour), sinon la derniere AG tenue. Modifiable dans le form.
                const suggeree =
                  c.prochaineAg?.date && c.prochaineAg.date <= today
                    ? c.prochaineAg.date
                    : c.derniereAgDate;
                return { code: c.code, nom: c.nom, ...(suggeree ? { agDateSuggeree: suggeree } : {}) };
              })
              .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }))}
            pennylaneActif={Boolean(process.env.PENNYLANE_API_KEY)}
            {...(coproInitial ? { coproInitial } : {})}
          />
        </div>

        <HistoriqueRecaps recaps={recaps} />
      </div>
    </AppShell>
  );
}
