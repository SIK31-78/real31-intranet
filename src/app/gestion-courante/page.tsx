import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutVoirComptabilite } from "@/lib/auth/roles";
import { trimestreCourant } from "@/lib/services/facturation/gestion-courante";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { PanneauGestionCourante } from "@/components/gestion-courante/panneau-gestion-courante";

export const metadata: Metadata = { title: "Gestion courante - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function GestionCourantePage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const habilite = peutVoirComptabilite(g.email, g.role);

  return (
    <AppShell user={g} active="gestion-courante" breadcrumb="Gestion courante">
      <div className="mx-auto flex max-w-[1000px] flex-col gap-5 px-8 py-8">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-semibold text-ink">
            <Landmark strokeWidth={1.5} className="h-5 w-5 text-green-700" />
            Facturation de gestion courante
          </h1>
          <p className="mt-1 text-[13px] text-ink-3">
            Chaque trimestre, lance la facturation des honoraires de gestion courante de toutes les
            copropriétés, en une fois. Un récapitulatif s&apos;affiche avant tout envoi.
          </p>
        </div>

        {habilite ? (
          <PanneauGestionCourante trimestreParDefaut={trimestreCourant()} />
        ) : (
          <Card>
            <p className="px-4 py-8 text-center text-[13px] text-ink-3">
              Cette page est réservée au pôle comptable.
            </p>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
