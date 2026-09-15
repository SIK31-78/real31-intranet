import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getCoprosFacturables } from "@/lib/services/coproprietes/copros-facturables";
import { estComptable } from "@/lib/auth/roles";
import { getFacturationRepository } from "@/lib/adapters/router";
import { AppShell } from "@/components/layout/app-shell";
import { FormulaireFacturation } from "@/components/facturation/formulaire-facturation";
import { FormulairePrestationContrat } from "@/components/facturation/formulaire-prestation-contrat";
import { Aide } from "@/components/ui/aide";
import { modeEmissionFacture } from "@/lib/domain/facturation/mode-emission";
import {
  HistoriqueFacturations,
  type FactureAffichee,
} from "@/components/facturation/historique-facturations";
import { Page, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = { title: "Facturation - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function FacturationPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  // Perimetre de facturation : le portefeuille pour un gestionnaire, les AGENCES tenues
  // pour un comptable (qui n'a aucun portefeuille -> l'ecran lui etait vide, alors que
  // facturer est son metier). L'historique reste BORNE a ces copros ("nos facturations",
  // pas celles de tout le monde).
  const copros = await getCoprosFacturables({
    managerId: g.id,
    email: g.email,
    estComptable: estComptable(g.email, g.role),
  });
  const historique = await getFacturationRepository().listerFacturesRecentes(
    50,
    copros.map((c) => c.code),
  );

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
      <Page largeur="lecture">
        <PageHeader
          titre="Facturation des honoraires syndic"
          aide={
            <p>
              Les montants sont calculés depuis le barème de l&apos;année du contrat en cours : ils ne sont jamais
              saisis à la main. Chaque facturation part ensuite en brouillon Pennylane, à valider par la compta.
            </p>
          }
        />

        <FormulaireFacturation
          copros={copros
    .map((c) => ({ code: c.code, nom: c.nom }))
    .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }))}
          pennylaneMode={modeEmissionFacture(process.env.PENNYLANE_API_KEY, process.env.PENNYLANE_FACTURE_VALIDEE)}
        />

        {/* Les 16 autres prestations du contrat (Sekou, 15/09/2026) : rangees sous un
            pli, parce qu'on ne les facture pas tous les jours. Un seul formulaire, la
            prestation choisie dicte ce qu'on saisit. */}
        <details className="group">
          <summary className="cursor-pointer text-title font-semibold tracking-tight text-ink flex items-center gap-2 py-1 list-none">
            <span className="text-ink-3 transition-transform group-open:rotate-90">▸</span>
            Autres prestations du contrat
            <span className="text-body font-normal text-ink-2">— AG supplémentaire, publication EDD, emprunt, mise en demeure, hypothèque, opposition, temps passé…</span>
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <Aide titre="Comment c'est facturé">
              Chaque prestation se compte comme le contrat l&apos;écrit : un montant fixe, un tarif par lot principal
              (pré-rempli depuis la fiche), par copropriétaire, ou un taux horaire à la demi-heure avec majoration
              d&apos;urgence de 40 %. Ce que le contrat impute au seul copropriétaire concerné est facturé au syndicat
              avec son nom sur la ligne : c&apos;est lui qui refacture. Le tarif est celui figé au contrat, sinon celui
              du barème de l&apos;année du contrat.
            </Aide>
            <FormulairePrestationContrat
              copros={copros
                .map((c) => ({ code: c.code, nom: c.nom }))
                .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }))}
              pennylaneMode={modeEmissionFacture(process.env.PENNYLANE_API_KEY, process.env.PENNYLANE_FACTURE_VALIDEE)}
            />
          </div>
        </details>

        <HistoriqueFacturations factures={factures} />
      </Page>
    </AppShell>
  );
}
