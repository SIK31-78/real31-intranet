// LA VITRINE d'adoption : /nouveautes, ouverte a TOUS les collaborateurs. Deux sections
// bien separees : "À venir / en cours" (ce qui est prévu et en chantier) et "Récemment
// livré" (le changelog). Ne montre QUE la projection publique (get-nouveautes ->
// versEntreePublique) : type, titre, date - JAMAIS l'auteur, la description interne ni la
// note. Aucun acces adapter direct (ADR-001).
//
// Le rendu des listes (et leur depliage « Afficher plus ») vit dans le composant client
// components/nouveautes/liste-nouveautes : la page, elle, reste un Server Component.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Rocket, CircleDot } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getNouveautes } from "@/lib/services/feedback/get-nouveautes";
import { AppShell } from "@/components/layout/app-shell";
import { ListeNouveautes } from "@/components/nouveautes/liste-nouveautes";
import { Page, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = { title: "Nouveautés - REAL31 Intranet" };

export const dynamic = "force-dynamic";

export default async function NouveautesPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const { aVenir, livre } = await getNouveautes();
  const vide = aVenir.length === 0 && livre.length === 0;

  return (
    <AppShell user={g} active="nouveautes" breadcrumb="Nouveautés">
      <Page largeur="lecture">
        <PageHeader
          titre="Nouveautés"
          meta="Ce qui arrive et ce qui vient d'être livré sur l'intranet."
          aide={<p>Une idée, un bug ? Le bouton « Un bug / une idée ? » est en bas à droite de chaque page.</p>}
        />

        {vide ? (
          <div className="rounded-md border border-dashed border-line bg-surface px-6 py-12 text-center">
            <p className="text-body font-medium text-ink">Rien pour l&apos;instant, revenez bientôt.</p>
            <p className="mt-1 text-body text-ink-3">
              Les évolutions prévues et livrées apparaîtront ici au fil de l&apos;eau.
            </p>
          </div>
        ) : (
          <>
            {aVenir.length > 0 && (
              <section aria-labelledby="nouveautes-avenir">
                <div className="mb-3 flex items-center gap-2">
                  <CircleDot strokeWidth={1.5} className="h-4 w-4 text-info-700" />
                  <h2 id="nouveautes-avenir" className="text-title font-semibold tracking-tight text-ink">
                    À venir / en cours
                  </h2>
                </div>
                <ListeNouveautes entrees={aVenir} variante="a_venir" />
              </section>
            )}

            {livre.length > 0 && (
              <section aria-labelledby="nouveautes-livre">
                <div className="mb-3 flex items-center gap-2">
                  <Rocket strokeWidth={1.5} className="h-4 w-4 text-green-700" />
                  <h2 id="nouveautes-livre" className="text-title font-semibold tracking-tight text-ink">
                    Récemment livré
                  </h2>
                </div>
                <ListeNouveautes entrees={livre} variante="livre" />
              </section>
            )}
          </>
        )}
      </Page>
    </AppShell>
  );
}
