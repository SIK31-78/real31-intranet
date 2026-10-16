// Seuils de relance du module « Contrats & contrôles » (REA-333, décision 10) : la fenêtre de
// suivi, les seuils orange et rouge, la cadence des mails, par sujet. RÉSERVÉ À LA DIRECTION.
// Sur le modèle de /admin/tarifs : un tableau, un bouton Enregistrer par ligne.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { RelancesAdminVue } from "@/components/admin/relances-admin-vue";
import { Page, PageHeader } from "@/components/ui/page";
import { estDirection, pageAccueilPour, profilDe } from "@/lib/auth/roles";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { listerRegles } from "@/lib/services/contrats-copro/regles";
import { sujetsArmes } from "@/lib/services/contrats-copro/relances";

export const metadata: Metadata = { title: "Seuils de relance - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function RelancesAdminPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!estDirection(profilDe(g))) redirect(pageAccueilPour(g.email, g.role));
  const regles = await listerRegles();

  return (
    <AppShell user={g} active="relances" breadcrumb="Administration / Seuils de relance">
      <Page largeur="lecture">
        <PageHeader
          titre="Seuils de relance"
          eyebrow="Contrats & contrôles"
          aide={
            <p>
              La fenêtre de suivi d&apos;un contrat s&apos;ouvre « premier rappel » jours avant son échéance : à partir de là,
              un compteur court depuis la dernière étape franchie. Au bout de « orange » jours sans étape le dossier passe
              orange, au bout de « rouge » jours il passe rouge et la direction de l&apos;agence est mise en copie des rappels.
              Les rappels par mail partent au binôme à la « cadence » indiquée, et seulement pour les sujets armés ci-dessous.
            </p>
          }
        />
        <RelancesAdminVue regles={regles} sujetsArmes={sujetsArmes()} />
      </Page>
    </AppShell>
  );
}
