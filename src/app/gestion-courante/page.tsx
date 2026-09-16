import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutVoirGestionCourante, peutOuvrirPerte, profilDe } from "@/lib/auth/roles";
import { trimestreCourant } from "@/lib/services/facturation/gestion-courante";
import { modeEmissionFacture } from "@/lib/domain/facturation/mode-emission";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { PanneauGestionCourante } from "@/components/gestion-courante/panneau-gestion-courante";
import { PerdreCopro } from "@/components/gestion-courante/perdre-copro";
import { Section } from "@/components/ui/section";
import { CardBody } from "@/components/ui/card";
import { getCoproRepository } from "@/lib/adapters/router";
import { listerDossiersPerte } from "@/lib/services/perte/dossier-perte";
import { Page, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = { title: "Gestion courante - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function GestionCourantePage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const habilite = peutVoirGestionCourante(g.email);
  // Pour « Perdre une copropriete » : toutes les copros ACTIVES du cabinet (geste
  // transverse), et les dernieres pertes actees.
  const aujourdhuiISO = new Date().toISOString().slice(0, 10);
  const [toutes, dossiers] = habilite
    ? await Promise.all([getCoproRepository().listerToutes(), listerDossiersPerte(aujourdhuiISO)])
    : [[], []];
  const perdues = dossiers.slice(0, 5).map((d) => ({
    id: d.id,
    coproCode: d.coproCode,
    coproNom: d.coproNom,
    dateAgISO: d.dateAgISO,
    faites: d.avancement.faites,
    total: d.avancement.total,
  }));
  const actives = toutes
    .filter((c) => c.statut === "active")
    .map((c) => ({ code: c.code, nom: c.nom }))
    .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }));

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

        {/* Perdre une copropriete (Sekou, 15/09/2026) : ici, parce que c'est la
            facturation que ca protege - LAPROMENAD, plus geree depuis juin, etait
            toujours ACTIVE et serait partie dans la prochaine fournee. */}
        {habilite && peutOuvrirPerte(profilDe(g)) && (
          <Section id="perdre-copro" titre="Perdre une copropriété">
            <Card>
              <CardBody>
                <PerdreCopro copros={actives} perdues={perdues} aujourdhuiISO={aujourdhuiISO} />
              </CardBody>
            </Card>
          </Section>
        )}
      </Page>
    </AppShell>
  );
}
