import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutVoirGestionCourante } from "@/lib/auth/roles";
import { trimestreCourant } from "@/lib/services/facturation/gestion-courante";
import { modeEmissionFacture } from "@/lib/domain/facturation/mode-emission";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { PanneauGestionCourante } from "@/components/gestion-courante/panneau-gestion-courante";
import { Page, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = { title: "Gestion courante - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function GestionCourantePage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const habilite = peutVoirGestionCourante(g.email);

  return (
    <AppShell user={g} active="gestion-courante" breadcrumb="Gestion courante">
      <Page largeur="lecture">
        <PageHeader
          titre="Facturation de gestion courante"
          aide={
            <p>
              Chaque trimestre, lancez la facturation des honoraires de gestion courante des copropriétés. Chaque
              ligne est comparée à son contrat : vous choisissez ce qui part.
            </p>
          }
        />

        {habilite ? (
          <PanneauGestionCourante
            trimestreParDefaut={trimestreCourant()}
            // L'ecran doit DIRE la verite avant d'engager : brouillon ou facture
            // deja validee chez Pennylane (donc irreversible).
            pennylaneMode={modeEmissionFacture(
              process.env.PENNYLANE_API_KEY,
              process.env.PENNYLANE_FACTURE_VALIDEE,
            )}
          />
        ) : (
          <Card>
            <p className="px-4 py-8 text-center text-body text-ink-3">
              Cette page est réservée à la comptabilité du cabinet.
            </p>
          </Card>
        )}
      </Page>
    </AppShell>
  );
}
