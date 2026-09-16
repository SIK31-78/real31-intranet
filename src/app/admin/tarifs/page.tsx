// Panneau d'administration du BAREME ANNUEL (intranet_tarifs). RESERVE SUPER-ADMIN.
// Une annee = une grille : le forfait de gestion courante, les 21 prestations du contrat
// imprime, les prestations facturables. « Ouvrir 2027 » copie 2026 ; les tarifs figes
// aux contrats signes ne bougent jamais d'ici (ADR-039, Sekou 15-16/09/2026).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin, pageAccueilPour } from "@/lib/auth/roles";
import { getBareme } from "@/lib/services/admin/bareme";
import { Page, PageHeader } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { TarifsAdminVue } from "@/components/admin/tarifs-admin-vue";

export const metadata: Metadata = { title: "Barème annuel - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function TarifsAdminPage({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!estSuperAdmin(g.email)) redirect(pageAccueilPour(g.email, g.role));
  const sp = await searchParams;
  const demandee = Number(sp.annee);
  const annee = Number.isInteger(demandee) && demandee >= 2020 && demandee <= 2100 ? demandee : new Date().getUTCFullYear();
  const bareme = await getBareme(annee);

  return (
    <AppShell user={g} active="tarifs" breadcrumb="Administration / Barème">
      <Page largeur="travail">
        <PageHeader
          titre="Barème annuel"
          eyebrow={`${bareme.lignes.length} tarifs en ${annee}`}
          actions={
            <span className="flex items-center gap-1">
              {bareme.annees.map((a) => (
                <ButtonLink key={a} href={`/admin/tarifs?annee=${a}`} variant={a === annee ? "secondary" : "ghost"} size="sm">{a}</ButtonLink>
              ))}
              {!bareme.annees.includes(annee + 1) && (
                <ButtonLink href={`/admin/tarifs?annee=${annee + 1}`} variant="ghost" size="sm">{annee + 1}…</ButtonLink>
              )}
            </span>
          }
          aide={
            <p>
              Montants TTC annuels. Ce barème nourrit trois choses : le contrat imprimé (les 21 prestations, au barème de
              l&apos;année de l&apos;AG), la facturation des prestations (au tarif figé sur le contrat de la copropriété, sinon
              celui-ci), et la proposition de contrat (le forfait). Modifier une ligne ne change aucun contrat déjà
              enregistré : les tarifs y sont figés. Pour une nouvelle année, ouvrez-la en copiant la précédente puis
              retouchez.
            </p>
          }
        />
        <TarifsAdminVue bareme={bareme} />
      </Page>
    </AppShell>
  );
}
