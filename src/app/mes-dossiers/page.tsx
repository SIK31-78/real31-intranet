// Accueil "variante C" (refonte UX, doc 1ter, valide Sekou) : l'AG en colonne vertebrale
// en tete (bloc 1) + les dossiers en cours dessous (bloc 2). Route /mes-dossiers construite
// A COTE de l'existant (le dashboard reste l'accueil par defaut - pas de bascule cette
// sequence). Donnees via services cloisonnes (getGestionnaireCourant -> managerId), jamais
// d'acces adapter/Supabase direct (ADR-001).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getAgSemaine } from "@/lib/services/affaires/get-ag-semaine";
import { getAffairesEnCours } from "@/lib/services/affaires/get-affaires-en-cours";
import { AppShell } from "@/components/layout/app-shell";
import { AgSemaineBloc } from "@/components/affaires/ag-semaine-bloc";
import { AffairesEnCours } from "@/components/affaires/affaires-en-cours";

export const metadata: Metadata = { title: "Mes dossiers en cours - REAL31 Intranet" };

// Lit la vraie data en mode supabase : rendu a la demande.
export const dynamic = "force-dynamic";

export default async function MesDossiersPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  // Independants -> en parallele (gain de latence). Tous deux cloisonnes sur g.id.
  const [agSemaine, affaires] = await Promise.all([getAgSemaine(g.id), getAffairesEnCours(g.id)]);

  return (
    <AppShell user={g} active="dossiers" breadcrumb="Mes dossiers en cours">
      <div className="mx-auto max-w-[1100px] px-8 py-8 flex flex-col gap-6">
        <AgSemaineBloc lignes={agSemaine} />

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h1 className="text-[20px] font-medium tracking-tight text-ink">Mes dossiers en cours</h1>
            <Link href="/dossiers" className="text-[13px] text-ink-3 hover:text-ink underline-offset-2 hover:underline">
              Tous les dossiers -&gt;
            </Link>
          </div>
          <AffairesEnCours affaires={affaires} />
        </section>
      </div>
    </AppShell>
  );
}
