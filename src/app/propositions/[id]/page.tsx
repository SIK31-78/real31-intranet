import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getAgenceRepository } from "@/lib/adapters/router";
import { calculerPrix, getProposition } from "@/lib/services/proposition/propositions";
import { LIBELLE_STATUT } from "@/lib/domain/proposition/proposition";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FicheProposition } from "./fiche-proposition";

export const metadata: Metadata = { title: "Proposition de contrat - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function PropositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const p = await getProposition(id);
  if (!p) notFound();
  const [prix, agences] = await Promise.all([calculerPrix(p.immeuble), getAgenceRepository().listerAgences()]);

  return (
    <AppShell user={g} active="propositions" breadcrumb={`Propositions · ${p.immeuble.adresse}`}>
      <Page largeur="travail">
        <PageHeader
          titre={p.immeuble.adresse}
          eyebrow={[p.immeuble.codePostal, p.immeuble.commune, p.agence ? `agence ${p.agence}` : null, p.gestionnaire].filter(Boolean).join(" · ")}
          actions={
            <span className="flex items-center gap-2">
              <Badge ton={p.statut === "elu" ? "ok" : p.statut.startsWith("refuse") ? "err" : p.statut === "accepte_cs" ? "warn" : "info"}>{LIBELLE_STATUT[p.statut]}</Badge>
              <ButtonLink href="/propositions" variant="secondary" size="sm"><ArrowLeft strokeWidth={1.5} /> Toutes les propositions</ButtonLink>
            </span>
          }
        />
        <FicheProposition proposition={p} prixGrille={prix} agences={agences.map((a) => a.code)} />
      </Page>
    </AppShell>
  );
}
