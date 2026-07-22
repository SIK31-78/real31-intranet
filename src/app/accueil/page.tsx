// LA HOME de l'intranet (bascule Sequence 3.B, valide Sekou) : deux zones bien
// SEPAREES et ETIQUETEES pour lever toute ambiguite AG vs dossier -
//   1. "Vos assemblees generales" = la colonne vertebrale (calcul get-ag-semaine).
//      Ce N'EST PAS un dossier : section a part, jamais melangee aux sinistres/travaux.
//   2. "Vos dossiers en cours" = sinistres, travaux, impayes... (get-affaires-en-cours).
// Route servie a tout le monde sauf le comptable pur (pageAccueilPour -> /comptabilite).
// Donnees via services cloisonnes (getGestionnaireCourant -> managerId), jamais d'acces
// adapter/Supabase direct (ADR-001).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getAgSemaine } from "@/lib/services/affaires/get-ag-semaine";
import { getAffairesEnCours } from "@/lib/services/affaires/get-affaires-en-cours";
import { AppShell } from "@/components/layout/app-shell";
import { AgSemaineBloc } from "@/components/affaires/ag-semaine-bloc";
import { AffairesEnCours } from "@/components/affaires/affaires-en-cours";

export const metadata: Metadata = { title: "Accueil - REAL31 Intranet" };

// Lit la vraie data en mode supabase : rendu a la demande.
export const dynamic = "force-dynamic";

export default async function AccueilPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  // Independants -> en parallele (gain de latence). Tous deux cloisonnes sur g.id.
  const [agSemaine, affaires] = await Promise.all([getAgSemaine(g.id), getAffairesEnCours(g.id)]);

  return (
    <AppShell user={g} active="accueil" breadcrumb="Accueil">
      <div className="mx-auto max-w-[1100px] px-8 py-8 flex flex-col gap-8">
        {/* ZONE 1 - Assemblees generales : la colonne vertebrale, PAS un dossier. Masquee
            quand rien ne presse (comme avant), le libelle n'apparait donc que s'il y a de
            l'AG a montrer - la ou l'etiquetage est justement necessaire. */}
        {agSemaine.length > 0 && (
          <section aria-labelledby="accueil-ag">
            <div className="mb-3">
              <h2 id="accueil-ag" className="text-[15px] font-semibold tracking-tight text-ink">
                Vos assemblées générales
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                Votre colonne vertébrale : préparation, convocation, tenue.
              </p>
            </div>
            <AgSemaineBloc lignes={agSemaine} />
          </section>
        )}

        {/* ZONE 2 - Dossiers en cours : sinistres, travaux, impayes. Distincte de l'AG. */}
        <section aria-labelledby="accueil-dossiers">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <div>
              <h2 id="accueil-dossiers" className="text-[15px] font-semibold tracking-tight text-ink">
                Vos dossiers en cours
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-3">Sinistres, travaux, impayés…</p>
            </div>
            <Link
              href="/dossiers"
              className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-green-700 shrink-0 underline-offset-2 hover:underline"
            >
              Tous les dossiers
              <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
            </Link>
          </div>
          <AffairesEnCours affaires={affaires} />
        </section>
      </div>
    </AppShell>
  );
}
