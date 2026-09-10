import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin, pageAccueilPour } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { getPointsEstaleRepository } from "@/lib/adapters/router";
import { PointsEstaleNonConfigureError } from "@/lib/ports/points-estale-repository";
import { comparerPoints, type PointEstale } from "@/lib/domain/points-estale";
import { PointsEstaleVue } from "@/components/admin/points-estale-vue";
import { Page, PageHeader } from "@/components/ui/page";
import { Callout } from "@/components/ui/callout";

export const metadata: Metadata = { title: "Points ESTALE - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Le carnet des points a porter a ESTALE (bloquants, questions, demandes) -
// remplace le fichier de notes. SUPER-ADMIN seulement.

export default async function PointsEstalePage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!estSuperAdmin(g.email)) redirect(pageAccueilPour(g.email, g.role));

  let points: PointEstale[] = [];
  let sqlManquant = false;
  try {
    points = (await getPointsEstaleRepository().lister()).sort(comparerPoints);
  } catch (e) {
    if (e instanceof PointsEstaleNonConfigureError) sqlManquant = true;
    else throw e;
  }

  return (
    <AppShell user={g} active="aucun" breadcrumb="Points ESTALE">
      <Page largeur="lecture">
        <PageHeader
          titre="Points ESTALE"
          aide={<p>Les bloquants, questions et demandes à porter à ESTALE, du constat interne jusqu&apos;à leur réponse.</p>}
        />
        {sqlManquant ? (
          <Callout ton="warn" titre="Table absente">
            SQL à passer : <code className="font-mono">supabase/sql/intranet_points_estale.sql</code>
          </Callout>
        ) : (
          <PointsEstaleVue points={points} />
        )}
      </Page>
    </AppShell>
  );
}
