import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMesEmails } from "@/lib/services/mes-emails/get-mes-emails";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { MesEmailsVue } from "@/components/mes-emails/mes-emails-vue";

export const metadata: Metadata = { title: "Mes événements - REAL31 Intranet" };

// Tri issu d'un backtest : rendu a la demande (pas de prerender statique).
export const dynamic = "force-dynamic";

export default async function MesEmailsPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const data = await getMesEmails(g);

  return (
    <AppShell user={g} active="emails" breadcrumb="Mes événements">
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <MesEmailsVue data={data} />
      </div>
    </AppShell>
  );
}
