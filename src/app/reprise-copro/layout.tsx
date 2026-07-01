// Layout du module Reprise de copro (porte de reprise-copro).
// Enveloppe les pages dans l'AppShell de l'intranet (topbar + sidebar) pour une
// integration native. Cloisonnement : getGestionnaireCourant (redirige si absent).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = { title: "Reprise de copro - REAL31 Intranet" };

export const dynamic = "force-dynamic";

export default async function RepriseLayout({ children }: { children: React.ReactNode }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  return (
    <AppShell user={g} active="reprise" breadcrumb="Reprise de copro">
      <div className="mx-auto max-w-[1100px] px-8 py-8">{children}</div>
    </AppShell>
  );
}
