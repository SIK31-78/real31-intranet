import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMesEmails } from "@/lib/services/mes-emails/get-mes-emails";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { MesEmailsVue } from "@/components/mes-emails/mes-emails-vue";
import { getSignatureGestionnaire } from "@/lib/services/mes-emails/get-signature";
import { synchroniserAction } from "./actions";
import { BoutonSynchro } from "./bouton-synchro";
import { Page } from "@/components/ui/page";

export const metadata: Metadata = { title: "Mes e-mails - REAL31 Intranet" };

// Tri issu d'un backtest : rendu a la demande (pas de prerender statique).
export const dynamic = "force-dynamic";

export default async function MesEmailsPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  // Module grise en prod tant que la vraie boite n'est pas branchee (MAIL_SOURCE=graph),
  // et reserve aux pilotes si MAIL_PILOTES est pose (deploiement pilote).
  if (!mailModuleActifPour(g.email)) redirect("/accueil");
  const data = await getMesEmails(g);
  const signatureHtml = await getSignatureGestionnaire(g);

  return (
    <AppShell user={g} active="emails" breadcrumb="Mes e-mails">
      <Page largeur="travail">
        <form action={synchroniserAction} className="flex items-center justify-end gap-3">
          {data.dateCourante ? (
            <span className="text-body text-ink-2">{data.dateCourante}</span>
          ) : null}
          <BoutonSynchro />
        </form>
        <MesEmailsVue data={data} signatureHtml={signatureHtml} />
      </Page>
    </AppShell>
  );
}
