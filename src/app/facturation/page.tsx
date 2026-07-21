import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getCoproprietes } from "@/lib/services/coproprietes/get-coproprietes";
import { getFacturationRepository } from "@/lib/adapters/router";
import { AppShell } from "@/components/layout/app-shell";
import { FormulaireFacturation } from "@/components/facturation/formulaire-facturation";
import {
  HistoriqueFacturations,
  type FactureAffichee,
} from "@/components/facturation/historique-facturations";

export const metadata: Metadata = { title: "Facturation - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function FacturationPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const [copros, historique] = await Promise.all([
    getCoproprietes(g.id),
    getFacturationRepository().listerFacturesRecentes(50),
  ]);

  const factures: FactureAffichee[] = historique.map((f) => ({
    id: f.id,
    coproCode: f.coproCode,
    typePrestation: f.typePrestation,
    libelle: f.libelle,
    dateFacture: f.dateFacture,
    statut: f.statut,
    montantHt: f.montantHt,
    ...(f.factureExterneId ? { factureExterneId: f.factureExterneId } : {}),
    ...(f.erreur ? { erreur: f.erreur } : {}),
    ...(f.par ? { par: f.par } : {}),
    creeLe: f.creeLe,
  }));

  return (
    <AppShell user={g} active="facturation" breadcrumb="Facturation">
      <div className="mx-auto max-w-[1000px] px-8 py-8 flex flex-col gap-5">
        <div>
          <h1 className="text-[20px] font-semibold text-ink flex items-center gap-2">
            <Receipt strokeWidth={1.5} className="w-5 h-5 text-green-700" />
            Facturation des honoraires syndic
          </h1>
          <p className="mt-1 text-[13px] text-ink-3">
            Les montants sont calculés depuis le barème de l&apos;année du contrat en cours : ils ne
            sont jamais saisis à la main. Chaque facturation part ensuite en brouillon Pennylane,
            à valider par la compta.
          </p>
        </div>

        <FormulaireFacturation
          copros={copros
    .map((c) => ({ code: c.code, nom: c.nom }))
    .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }))}
          pennylaneActif={Boolean(process.env.PENNYLANE_API_KEY)}
        />

        <HistoriqueFacturations factures={factures} />
      </div>
    </AppShell>
  );
}
