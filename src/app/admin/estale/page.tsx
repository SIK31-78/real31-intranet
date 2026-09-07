import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin, pageAccueilPour } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { getPointsEstaleRepository } from "@/lib/adapters/router";
import { PointsEstaleNonConfigureError } from "@/lib/ports/points-estale-repository";
import { comparerPoints, type PointEstale } from "@/lib/domain/points-estale";
import { PointsEstaleVue } from "@/components/admin/points-estale-vue";

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
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 md:px-8 md:py-8">
        <h1 className="text-[22px] font-medium tracking-tight">Points ESTALE</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Les bloquants, questions et demandes à porter à ESTALE, du constat interne jusqu&apos;à leur réponse.
        </p>
        {sqlManquant ? (
          <div className="mt-6 rounded-md border border-warn-500/30 bg-warn-50 px-4 py-3 text-[13px] text-warn-700">
            Table absente : SQL à passer : <code className="font-mono">supabase/sql/intranet_points_estale.sql</code>
          </div>
        ) : (
          <PointsEstaleVue points={points} />
        )}
      </div>
    </AppShell>
  );
}
