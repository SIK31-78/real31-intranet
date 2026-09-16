import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getDossierPerte } from "@/lib/services/perte/dossier-perte";
import { avancement } from "@/lib/domain/perte/dossier";
import { formatDateLongue } from "@/lib/format-date";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { FicheDossierPerte } from "./fiche-dossier";

import { jourParis } from "@/lib/services/date-du-jour";
export const metadata: Metadata = { title: "Dossier de perte - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function DossierPertePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const dossier = await getDossierPerte(id);
  if (!dossier) notFound();
  const aujourdhuiISO = jourParis();
  const a = avancement(dossier, aujourdhuiISO);

  return (
    <AppShell user={g} active="perte" breadcrumb={`Perte de copropriété · ${dossier.coproCode}`}>
      <Page largeur="travail">
        <PageHeader
          titre={`${dossier.coproCode} · ${dossier.coproNom}`}
          eyebrow={`AG du ${formatDateLongue(dossier.dateAgISO)} · gérée jusqu'au ${formatDateLongue(dossier.finGestionISO)}${dossier.motif ? ` · ${dossier.motif}` : ""}`}
          actions={
            <span className="flex items-center gap-2">
              {dossier.statut === "termine" ? (
                <Badge ton="ok">terminé</Badge>
              ) : (
                <Badge ton="neutral">{a.faites}/{a.total} étapes</Badge>
              )}
              <ButtonLink href="/perte-copro" variant="secondary" size="sm">
                <ArrowLeft strokeWidth={1.5} /> Toutes les pertes
              </ButtonLink>
            </span>
          }
        />
        <FicheDossierPerte dossier={dossier} aujourdhuiISO={aujourdhuiISO} moi={g.nomComplet} />
      </Page>
    </AppShell>
  );
}
