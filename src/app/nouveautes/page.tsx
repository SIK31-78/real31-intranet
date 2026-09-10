// LA VITRINE d'adoption : /nouveautes, ouverte a TOUS les collaborateurs. Deux sections
// bien separees : "À venir / en cours" (ce qui est prévu et en chantier) et "Récemment
// livré" (le changelog). Ne montre QUE la projection publique (get-nouveautes ->
// versEntreePublique) : type, titre, date - JAMAIS l'auteur, la description interne ni la
// note. Aucun acces adapter direct (ADR-001).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bug, Lightbulb, Rocket, CircleDot, ChevronDown } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getNouveautes } from "@/lib/services/feedback/get-nouveautes";
import { formatDateLongue } from "@/lib/format-date";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import type { EntreePublique } from "@/lib/domain/feedback";
import { Page, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = { title: "Nouveautés - REAL31 Intranet" };

export const dynamic = "force-dynamic";

function TypePastille({ type }: { type: EntreePublique["type"] }) {
  const bug = type === "bug";
  const Icon = bug ? Bug : Lightbulb;
  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
 bug ? "bg-info-50 text-info-700" : "bg-green-50 text-green-700"
      }`}
    >
      <Icon strokeWidth={1.5} className="h-4 w-4" />
    </span>
  );
}

/** Ligne depliable quand un RESUME PUBLIC existe (redige au triage hebdo - jamais la
 *  description interne). <details> natif : la page reste 100 % serveur. */
function Ligne({ entree, droite }: { entree: EntreePublique; droite: React.ReactNode }) {
  if (!entree.resume) {
    return (
      <li className="flex items-center gap-3 rounded-lg border border-line bg-surface shadow-1 px-4 py-3">
        <TypePastille type={entree.type} />
        <span className="min-w-0 flex-1 text-body text-ink">{entree.titre}</span>
        {droite}
      </li>
    );
  }
  return (
    <li className="rounded-lg border border-line bg-surface shadow-1">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <TypePastille type={entree.type} />
          <span className="min-w-0 flex-1 text-body text-ink">{entree.titre}</span>
          {droite}
          <ChevronDown
            strokeWidth={1.5}
            className="h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform group-open:rotate-180"
          />
        </summary>
        <p className="border-t border-line px-4 py-3 pl-11 text-body leading-relaxed text-ink-2 whitespace-pre-wrap">
          {entree.resume}
        </p>
      </details>
    </li>
  );
}

function LigneAVenir({ entree }: { entree: EntreePublique }) {
  return (
    <Ligne
      entree={entree}
      droite={
        entree.statut === "en_cours" ? (
          <Badge ton="warn" dot>
            En cours
          </Badge>
        ) : (
          <Badge ton="info" dot>
            Prévu
          </Badge>
        )
      }
    />
  );
}

function LigneLivre({ entree }: { entree: EntreePublique }) {
  return (
    <Ligne
      entree={entree}
      droite={
        entree.livreAt ? (
          <span className="shrink-0 text-body text-ink-3">{formatDateLongue(entree.livreAt.slice(0, 10))}</span>
        ) : null
      }
    />
  );
}

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
                <ul className="flex flex-col gap-2">
                  {aVenir.map((e, i) => (
                    <LigneAVenir key={`av-${i}`} entree={e} />
                  ))}
                </ul>
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
                <ul className="flex flex-col gap-2">
                  {livre.map((e, i) => (
                    <LigneLivre key={`li-${i}`} entree={e} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </Page>
    </AppShell>
  );
}
