import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { acteurCles } from "@/lib/auth/acteur-cles";
import { estDirectionCles } from "@/lib/domain/cles/acteur";
import { coprosPourCles } from "@/lib/services/cles/copros-choix";
import { AGENCES_CLES } from "@/lib/domain/cles/types";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Card, CardBody } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { FormulaireTrousseau } from "@/components/cles/formulaire-trousseau";

export const metadata: Metadata = { title: "Nouveau trousseau - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function NouveauTrousseauPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const [acteur, copros] = await Promise.all([acteurCles(g), coprosPourCles()]);
  const direction = estDirectionCles(acteur);
  return (
    <AppShell user={g} active="cles" breadcrumb="Gestion des clés · Nouveau trousseau">
      <Page largeur="travail">
        <PageHeader titre="Nouveau trousseau" eyebrow={acteur.agence ? `Agence ${acteur.agence}` : undefined} aide={<p>Le numéro suit la série de l&apos;agence (R…, J…). La composition sert au contrôle du retour ; elle peut se compléter plus tard.</p>} />
        {!acteur.agence && !direction ? (
          <Callout ton="warn">Ton agence n&apos;est pas connue : demande à la direction de la renseigner avant de créer des trousseaux.</Callout>
        ) : (
          <Card><CardBody><FormulaireTrousseau copros={copros} agenceCode={acteur.agence} agences={direction ? [...AGENCES_CLES] : undefined} /></CardBody></Card>
        )}
      </Page>
    </AppShell>
  );
}
