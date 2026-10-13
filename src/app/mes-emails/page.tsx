import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMesEmails } from "@/lib/services/mes-emails/get-mes-emails";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { MesEmailsVue } from "@/components/mes-emails/mes-emails-vue";
import { getSignatureGestionnaire } from "@/lib/services/mes-emails/get-signature";
import { depotPieceJointeActif } from "@/lib/services/mes-emails/deposer-piece-jointe";
import { adresseFacturesAgence } from "@/lib/services/mes-emails/transmettre-facture";
import { rafraichirAction } from "./actions";
import { BoutonRafraichir } from "./bouton-rafraichir";
import { Page } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Mes e-mails - REAL31 Intranet" };

// Lecture LIVE des boites a chaque affichage (plus de synchro) : rendu a la demande.
export const dynamic = "force-dynamic";

export default async function MesEmailsPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  // Module grise en prod tant que la vraie boite n'est pas branchee (MAIL_SOURCE=graph),
  // et reserve aux pilotes si MAIL_PILOTES est pose (deploiement pilote).
  if (!mailModuleActifPour(g.email)) redirect("/accueil");
  const [data, signatureHtml] = await Promise.all([getMesEmails(g), getSignatureGestionnaire(g)]);

  return (
    <AppShell user={g} active="emails" breadcrumb="Mes e-mails">
      <Page largeur="travail">
        <form action={rafraichirAction} className="flex items-center justify-end gap-3">
          <span className="text-meta text-ink-3">Lecture en direct des boîtes</span>
          <ButtonLink href="/mes-emails/composer" variant="secondary" size="sm">
            Composer un e-mail
          </ButtonLink>
          <BoutonRafraichir />
        </form>
        <MesEmailsVue
          data={data}
          signatureHtml={signatureHtml}
          depotDriveActif={depotPieceJointeActif()}
          adresseFactures={adresseFacturesAgence()}
        />
      </Page>
    </AppShell>
  );
}
