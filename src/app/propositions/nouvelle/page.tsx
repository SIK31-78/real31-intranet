import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getAgenceRepository } from "@/lib/adapters/router";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { SaisieRapide } from "./saisie-rapide";

export const metadata: Metadata = { title: "Nouvelle proposition - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// La saisie rapide (ADR-039) : celui qui decroche note ce qu'il sait, l'ecran lui dit quoi
// demander, et la proposition remonte dans le pipeline pour le gestionnaire.

export default async function NouvellePropositionPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const toutes = await getAgenceRepository().listerAgences();
  const agences = toutes.map((a) => a.code);
  // L'agence du collaborateur, proposee par defaut.
  const agenceParDefaut = toutes.find((a) => a.id === g.agencyId)?.code;
  return (
    <AppShell user={g} active="propositions" breadcrumb="Propositions · Nouvelle">
      <Page largeur="lecture">
        <PageHeader
          titre="Nouvelle proposition"
          aide={
            <p>
              Tapez l&apos;adresse : si l&apos;immeuble est au registre national, ses lots et son syndic actuel se
              remplissent. Le reste peut attendre — la fiche indiquera ce qui manque pour faire l&apos;offre.
            </p>
          }
        />
        <SaisieRapide agences={agences} agenceParDefaut={agenceParDefaut} />
      </Page>
    </AppShell>
  );
}
