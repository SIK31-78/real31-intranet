import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getMesEmails } from "@/lib/services/mes-emails/get-mes-emails";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { MesEmailsVue } from "@/components/mes-emails/mes-emails-vue";
import { COOKIE_PLACE_INTERNES } from "@/components/mes-emails/preference-liste";
import { placeInternesValide } from "@/lib/domain/mes-emails-liste";
import { getSignatureGestionnaire } from "@/lib/services/mes-emails/get-signature";
import { agenceDesModeles, modelesMailPour } from "@/lib/services/mes-emails/modeles-mail";
import { depotPieceJointeActif } from "@/lib/services/mes-emails/deposer-piece-jointe";
import { adresseFacturesAgence } from "@/lib/services/mes-emails/transmettre-facture";
import { rafraichirAction } from "./actions";
import { BoutonRafraichir } from "./bouton-rafraichir";
import { Page } from "@/components/ui/page";
import { EnvoyerEmail } from "@/components/mes-emails/envoyer-email";
import { boiteEnvoi, brouillonPossible, envoiDirectComposition } from "@/lib/services/mes-emails/composer-mail";

export const metadata: Metadata = { title: "E-mails - REAL31 Intranet" };

// Lecture LIVE des boites a chaque affichage (plus de synchro) : rendu a la demande.
export const dynamic = "force-dynamic";

// Boite perso : 40 mails par defaut (une seule page Graph), « Plus de mails » ajoute 40.
function plafondPerso(plus: string | undefined): number {
  const n = Number(plus);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 40), 200) : 40;
}

export default async function MesEmailsPage({ searchParams }: { searchParams: Promise<{ plus?: string }> }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  // Module grise en prod tant que la vraie boite n'est pas branchee (MAIL_SOURCE=graph),
  // et reserve aux pilotes si MAIL_PILOTES est pose (deploiement pilote).
  if (!mailModuleActifPour(g.email)) redirect("/accueil");
  const maxPerso = plafondPerso((await searchParams).plus);
  // PILOTE (16/10/2026) : le 15/10, un changement d'affichage de cet écran mis en prod sans
  // avoir été vu a fait appeler toute l'agence. Toute nouveauté visible passe d'abord par
  // le super-admin ; les actions serveur de ces nouveautés refusent aussi les autres.
  const pilote = estSuperAdmin(g.email);
  const placeInternes = pilote ? placeInternesValide((await cookies()).get(COOKIE_PLACE_INTERNES)?.value) : "meles";
  const [data, signatureHtml, modeles] = await Promise.all([
    getMesEmails(g, maxPerso),
    getSignatureGestionnaire(g),
    agenceDesModeles(g.agencyId).then(modelesMailPour),
  ]);

  return (
    <AppShell user={g} active="emails" breadcrumb="E-mails">
      <Page largeur="travail">
        <form action={rafraichirAction} className="flex items-center gap-3">
          <h1 className="text-page font-medium tracking-tight text-ink mr-auto">E-mails</h1>
          <EnvoyerEmail
            gestionnaireNom={g.nomComplet}
            agence={(process.env.MAIL_TRI_AGENCE ?? "").trim()}
            brouillonPossible={brouillonPossible()}
            envoiDirect={envoiDirectComposition()}
            boite={boiteEnvoi()}
            signatureHtml={signatureHtml}
            modeles={modeles}
          />
          <BoutonRafraichir />
        </form>
        <MesEmailsVue
          data={data}
          signatureHtml={signatureHtml}
          depotDriveActif={depotPieceJointeActif()}
          adresseFactures={adresseFacturesAgence()}
          agence={(process.env.MAIL_TRI_AGENCE ?? "").trim()}
          maxPerso={maxPerso}
          modeles={modeles}
          pilote={pilote}
          placeInternesInitiale={placeInternes}
        />
      </Page>
    </AppShell>
  );
}
