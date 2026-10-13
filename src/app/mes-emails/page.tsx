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
import { EnvoyerEmail } from "@/components/mes-emails/envoyer-email";
import { boiteEnvoi, brouillonPossible } from "@/lib/services/mes-emails/composer-mail";

export const metadata: Metadata = { title: "E-mails - REAL31 Intranet" };

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
    <AppShell user={g} active="emails" breadcrumb="E-mails">
      <Page largeur="travail">
        <form action={rafraichirAction} className="flex items-center gap-3">
          <h1 className="text-page font-medium tracking-tight text-ink mr-auto">E-mails</h1>
          <EnvoyerEmail
            gestionnaireNom={g.nomComplet}
            agence={(process.env.MAIL_TRI_AGENCE ?? "").trim()}
            brouillonPossible={brouillonPossible()}
            boite={boiteEnvoi()}
            signatureHtml={signatureHtml}
          />
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
