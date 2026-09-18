import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { acteurCles } from "@/lib/auth/acteur-cles";
import { journalCles } from "@/lib/services/cles/lecture";
import { TYPES_MOUVEMENT, type TypeMouvement } from "@/lib/domain/cles/types";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { JournalTable } from "@/components/cles/journal-table";
import { FiltresJournal } from "@/components/cles/filtres-journal";

export const metadata: Metadata = { title: "Journal des clés - REAL31 Intranet" };
export const dynamic = "force-dynamic";

const PAR_PAGE = 50;

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ page?: string; type?: string; de?: string; a?: string; par?: string }> }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const sp = await searchParams;
  const acteur = await acteurCles(g);
  const page = Math.max(1, Number(sp.page) || 1);
  const type = TYPES_MOUVEMENT.includes(sp.type as TypeMouvement) ? (sp.type as TypeMouvement) : undefined;
  const jour = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const journal = await journalCles({ agenceCode: acteur.agence, types: type ? [type] : undefined, deISO: jour(sp.de), aISO: jour(sp.a), par: sp.par?.trim() || undefined, page, parPage: PAR_PAGE });
  const pages = Math.max(1, Math.ceil(journal.total / PAR_PAGE));
  const lien = (p: number) => { const q = new URLSearchParams(); if (type) q.set("type", type); if (sp.de) q.set("de", sp.de); if (sp.a) q.set("a", sp.a); if (sp.par) q.set("par", sp.par); q.set("page", String(p)); return `/cles/journal?${q}`; };

  return (
    <AppShell user={g} active="cles" breadcrumb="Gestion des clés · Journal">
      <Page largeur="travail">
        <PageHeader titre="Journal des mouvements" eyebrow={`${journal.total} mouvement${journal.total > 1 ? "s" : ""}${acteur.agence ? ` · agence ${acteur.agence}` : ""}`} actions={<ButtonLink href="/cles" variant="ghost" size="sm"><ArrowLeft strokeWidth={1.5} /> Comptoir</ButtonLink>} aide={<p>Chaque geste est une ligne, horodatée par le serveur, jamais modifiée : une correction est une nouvelle ligne qui cite l&apos;originale.</p>} />
        <FiltresJournal type={type ?? ""} de={sp.de ?? ""} a={sp.a ?? ""} par={sp.par ?? ""} />
        <JournalTable lignes={journal.lignes} />
        {pages > 1 && (
          <nav className="flex items-center justify-between text-body text-ink-2" aria-label="Pages du journal">
            {page > 1 ? <ButtonLink href={lien(page - 1)} variant="secondary" size="sm">Plus récents</ButtonLink> : <span />}
            <span className="tabular-nums">page {page} / {pages}</span>
            {page < pages ? <ButtonLink href={lien(page + 1)} variant="secondary" size="sm">Plus anciens</ButtonLink> : <span />}
          </nav>
        )}
      </Page>
    </AppShell>
  );
}
