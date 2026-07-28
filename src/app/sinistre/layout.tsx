// Layout de la section Sinistre (module porté de gestion-sinistres).
// Enveloppe les pages dans l'AppShell de l'intranet (topbar + sidebar) pour une
// intégration visuelle native, puis dans la frontière client SinistreProviders
// (contexte du dossier + sous-nav). Cloisonnement : getGestionnaireCourant.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import "./sinistre.css";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { SinistreProviders } from "@/components/sinistre/sinistre-providers";

export const metadata: Metadata = { title: "Sinistre - REAL31 Intranet" };

export const dynamic = "force-dynamic";

export default async function SinistreLayout({ children }: { children: React.ReactNode }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  return (
    <AppShell user={g} active="sinistres" breadcrumb="Sinistre">
      <div className="sinistre-root mx-auto max-w-[1100px] px-4 py-6 sm:px-6 md:px-8 md:py-8 print-container">
        <SinistreProviders>{children}</SinistreProviders>
      </div>
    </AppShell>
  );
}
