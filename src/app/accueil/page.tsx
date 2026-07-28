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
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getAgSemaine } from "@/lib/services/affaires/get-ag-semaine";
import { getAffairesEnCours } from "@/lib/services/affaires/get-affaires-en-cours";
import { getAccueilComplement } from "@/lib/services/accueil/get-accueil-complement";
import { getAnnoncesActives } from "@/lib/services/annonces/get-annonces-actives";
import { formatDateLongue } from "@/lib/format-date";
import { AppShell } from "@/components/layout/app-shell";
import { AgSemaineBloc } from "@/components/affaires/ag-semaine-bloc";
import { AffairesEnCours } from "@/components/affaires/affaires-en-cours";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { AnnoncesPanel } from "@/components/dashboard/annonces-panel";
import { ProblemesPanel } from "@/components/dashboard/problemes-panel";
import { EchangesComptablesPanel } from "@/components/dashboard/echanges-comptables-panel";

export const metadata: Metadata = { title: "Accueil - REAL31 Intranet" };

// Lit la vraie data en mode supabase : rendu a la demande.
export const dynamic = "force-dynamic";

export default async function AccueilPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const today = new Date().toISOString().slice(0, 10);
  // Independants -> en parallele (gain de latence). Tous cloisonnes sur g.id.
  const [agSemaine, affaires, complement, annonces] = await Promise.all([
    getAgSemaine(g.id),
    getAffairesEnCours(g.id),
    getAccueilComplement(g),
    // Annonces CIBLEES : filtrees pour CE collaborateur (groupe / son agence / son email).
    getAnnoncesActives({ email: g.email, agencyId: g.agencyId }),
  ]);

  return (
    <AppShell user={g} active="accueil" breadcrumb="Accueil">
      <div className="mx-auto max-w-[1100px] px-8 py-8 flex flex-col gap-8">
        {/* EN-TETE : "Bonjour X" + date. Ex-dashboard (demantele, Sekou 2026-07-22). */}
        <DashboardHeader gestionnaire={g} dateCourante={formatDateLongue(today)} />

        {/* Bandeau d'onboarding : copros aux dates heritees a verifier avant qu'elles
            n'entrent dans le cockpit. Conditionnel (rien si aucune). */}
        {complement.aPrendreEnMain > 0 && (
          <Link
            href="/copropriete"
            className="flex items-center gap-2.5 rounded-md border border-warn-500/30 bg-warn-50 px-4 py-2.5 text-[13px] text-warn-700 hover:border-warn-500/50 transition-colors"
          >
            <ClipboardCheck strokeWidth={1.5} className="w-4 h-4 shrink-0" />
            <span className="flex-1">
              <strong>{complement.aPrendreEnMain}</strong> copropriété{complement.aPrendreEnMain > 1 ? "s" : ""} à
              prendre en main - vérifie les dates héritées avant qu&apos;elles n&apos;entrent dans ton cockpit.
            </span>
            <ArrowRight strokeWidth={1.5} className="w-4 h-4 shrink-0" />
          </Link>
        )}

        {/* Annonces du reseau (direction), pilotees depuis /admin/annonces. Etat vide propre. */}
        <AnnoncesPanel annonces={annonces} />

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

        {/* Echanges comptables : notes de la comptable NON RESOLUES sur les copros du
            gestionnaire - il doit repondre. Remontee active (le fil existait, mais rien ne
            l'alertait). Conditionnel : rien si aucun echange ouvert. */}
        {complement.echangesComptables.length > 0 && (
          <section aria-labelledby="accueil-compta">
            <div className="mb-3">
              <h2 id="accueil-compta" className="text-[15px] font-semibold tracking-tight text-ink">
                Échanges comptables
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                La comptable attend une réponse sur ces copropriétés - ouvre la fiche pour répondre.
              </p>
            </div>
            <EchangesComptablesPanel echanges={complement.echangesComptables} />
          </section>
        )}

        {/* ZONE 3 - Points signales : problemes coches en supervision AG, actionnables.
            Ex-dashboard (demantele). Conditionnel : rien (pas de titre orphelin) si vide. */}
        {complement.problemes.length > 0 && (
          <section aria-labelledby="accueil-problemes">
            <div className="mb-3">
              <h2 id="accueil-problemes" className="text-[15px] font-semibold tracking-tight text-ink">
                Points signalés
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                Problèmes remontés depuis la supervision AG - à traiter.
              </p>
            </div>
            <ProblemesPanel problemes={complement.problemes} />
          </section>
        )}
      </div>
    </AppShell>
  );
}
