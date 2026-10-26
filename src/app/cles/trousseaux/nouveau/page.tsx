import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { acteurCles } from "@/lib/auth/acteur-cles";
import { agenceAffichee, agencesVisibles, estDirectionCles } from "@/lib/domain/cles/acteur";
import { coprosPourCles } from "@/lib/services/cles/copros-choix";
import { AGENCES_CLES, LIBELLE_AGENCE_CLES } from "@/lib/domain/cles/types";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Card, CardBody } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { FormulaireTrousseau } from "@/components/cles/formulaire-trousseau";

export const metadata: Metadata = { title: "Nouveau trousseau - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function NouveauTrousseauPage({ searchParams }: { searchParams: Promise<{ agence?: string }> }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const [acteur, copros, { agence: agenceDemandee }] = await Promise.all([acteurCles(g), coprosPourCles(), searchParams]);
  // Arrive du comptoir d'une autre agence (?agence=HLS) : elle est preselectionnee.
  const agence = agenceAffichee(acteur, agenceDemandee);
  const direction = estDirectionCles(acteur);
  return (
    <AppShell user={g} active="cles" breadcrumb="Gestion des clés · Nouveau trousseau">
      <Page largeur="travail">
        <PageHeader titre="Nouveau trousseau" eyebrow={agence ? `Agence ${LIBELLE_AGENCE_CLES[agence] ?? agence}` : undefined} aide={<p>Le numéro suit la série de l&apos;agence (R…, J…). La composition sert au contrôle du retour ; elle peut se compléter plus tard.</p>} />
        {!agence && !direction ? (
          <Callout ton="warn">Ton agence n&apos;est pas connue : demande à la direction de la renseigner avant de créer des trousseaux.</Callout>
        ) : (
          <Card><CardBody><FormulaireTrousseau copros={copros} agenceCode={agence} agences={direction ? [...AGENCES_CLES] : agencesVisibles(acteur).length > 1 ? agencesVisibles(acteur) : undefined} /></CardBody></Card>
        )}
      </Page>
    </AppShell>
  );
}
