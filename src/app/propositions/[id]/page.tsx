import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getAgenceRepository } from "@/lib/adapters/router";
import { calculerPrix, contexteImmeuble, getProposition, suggererRapprochement } from "@/lib/services/proposition/propositions";
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
  const [prix, agences, contexte, suggestion] = await Promise.all([
    calculerPrix(p.immeuble),
    getAgenceRepository().listerAgences(),
    contexteImmeuble(p),
    p.immeuble.immatriculation ? Promise.resolve(undefined) : suggererRapprochement(p),
  ]);
  const meta = [
    p.immeuble.lotsPrincipaux !== undefined ? `${p.immeuble.lotsPrincipaux} lots principaux` : null,
    p.prix.honorairesTtc !== undefined ? `${p.prix.honorairesTtc.toLocaleString("fr-FR")} € TTC retenus` : null,
    p.contact.nom ?? null,
    contexte.copro ? (contexte.copro.statut === "active" ? `déjà gérée (${contexte.copro.code})` : `ancienne copropriété (${contexte.copro.code})`) : null,
    contexte.autres.length > 0 ? `${contexte.autres.length} consultation${contexte.autres.length > 1 ? "s" : ""} précédente${contexte.autres.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean);

  return (
    <AppShell user={g} active="propositions" breadcrumb={`Propositions · ${p.immeuble.adresse}`}>
      <Page largeur="travail">
        <PageHeader
          titre={p.immeuble.adresse}
          eyebrow={[p.immeuble.codePostal, p.immeuble.commune, p.agence ? `agence ${p.agence}` : null, p.gestionnaire].filter(Boolean).join(" · ")}
          badge={<Badge ton={p.statut === "elu" ? "ok" : p.statut.startsWith("refuse") ? "err" : p.statut === "accepte_cs" ? "warn" : "info"} size="md">{LIBELLE_STATUT[p.statut]}</Badge>}
          meta={meta.length > 0 ? meta.join(" · ") : undefined}
          actions={<ButtonLink href="/propositions" variant="secondary" size="sm"><ArrowLeft strokeWidth={1.5} /> Pipeline</ButtonLink>}
        />
        <FicheProposition proposition={p} prixGrille={prix} agences={agences.map((a) => a.code)} contexte={contexte} suggestion={suggestion} />
      </Page>
    </AppShell>
  );
}
