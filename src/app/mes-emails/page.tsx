import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMesEmails } from "@/lib/services/mes-emails/get-mes-emails";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { MesEmailsVue } from "@/components/mes-emails/mes-emails-vue";
import { synchroniserAction } from "./actions";

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
        <form action={synchroniserAction} className="mb-4 flex items-center justify-end gap-3">
          {data.dateCourante ? (
            <span className="text-[12px] text-ink-3">{data.dateCourante}</span>
          ) : null}
          <button
            type="submit"
            className="rounded-md bg-green-700 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-green-800"
          >
            Synchroniser ma boîte
          </button>
        </form>
        <MesEmailsVue data={data} />
      </div>
    </AppShell>
  );
}
