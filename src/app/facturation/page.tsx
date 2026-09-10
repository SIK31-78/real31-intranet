import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getCoprosFacturables } from "@/lib/services/coproprietes/copros-facturables";
import { estComptable } from "@/lib/auth/roles";
import { getFacturationRepository } from "@/lib/adapters/router";
import { AppShell } from "@/components/layout/app-shell";
import { FormulaireFacturation } from "@/components/facturation/formulaire-facturation";
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

        <HistoriqueFacturations factures={factures} />
      </Page>
    </AppShell>
  );
}
