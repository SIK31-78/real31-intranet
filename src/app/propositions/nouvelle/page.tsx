import type { Metadata } from "next";
import { exigerAccesPropositions } from "@/app/propositions/acces";
import { getAgenceRepository } from "@/lib/adapters/router";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { SaisieRapide } from "./saisie-rapide";

export const metadata: Metadata = { title: "Nouveau contact - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Nouveau contact (ADR-039) : celui qui decroche note ce qu'il sait, l'ecran lui dit quoi
// demander, et la proposition remonte dans le pipeline pour le gestionnaire.

export default async function NouvellePropositionPage() {
  const g = await exigerAccesPropositions();
  const toutes = await getAgenceRepository().listerAgences();
  const agences = toutes.map((a) => a.code);
  // L'agence du collaborateur, proposee par defaut.
  const agenceParDefaut = toutes.find((a) => a.id === g.agencyId)?.code;
  return (
    <AppShell user={g} active="propositions" breadcrumb="Propositions · Nouveau contact">
      <Page largeur="lecture">
        <PageHeader
          titre="Nouveau contact"
          meta="Un appel, une visite, un mail : l'adresse et de quoi rappeler suffisent pour commencer."
        />
        <SaisieRapide agences={agences} agenceParDefaut={agenceParDefaut} />
      </Page>
    </AppShell>
  );
}
