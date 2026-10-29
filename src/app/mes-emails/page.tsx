import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getMesEmails } from "@/lib/services/mes-emails/get-mes-emails";
import { getGestionnaireCourant, mailModuleActifPour, incarnationEnCours } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { MesEmailsVue } from "@/components/mes-emails/mes-emails-vue";
import { COOKIE_PLACE_INTERNES } from "@/components/mes-emails/preference-liste";
import { placeInternesValide } from "@/lib/domain/mes-emails-liste";
import { getSignatureGestionnaire } from "@/lib/services/mes-emails/get-signature";
import { agenceDesModeles, modelesMailPour } from "@/lib/services/mes-emails/modeles-mail";
import { facturesEstaleConfigurees } from "@/lib/services/mes-emails/transmettre-facture";
import { rafraichirAction } from "./actions";
import { BoutonRafraichir } from "./bouton-rafraichir";
import { Page } from "@/components/ui/page";
import { EnvoyerEmail } from "@/components/mes-emails/envoyer-email";
import { ChiffreTitre } from "@/components/mes-emails/chiffre-a-traiter";
import { boiteDeComposition, boiteEnvoi, brouillonPossible, envoiDirectComposition } from "@/lib/services/mes-emails/composer-mail";
import { reformulationDisponible } from "@/lib/services/ia/reformuler-mail";

export const metadata: Metadata = { title: "E-mails - REAL31 Intranet" };

// Lecture LIVE des boites a chaque affichage (plus de synchro) : rendu a la demande.
export const dynamic = "force-dynamic";
// Deux boîtes Graph, le portefeuille ESTALE et la signature en série peuvent dépasser les
// 15 s par défaut de Vercel sur une agence chargée (27/10/2026) : on laisse une minute.
export const maxDuration = 60;

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
  // 21/10/2026 : les cinq nouveautés du pilote (corbeille groupée, Envoyés, mise en forme,
  // Transférer, place des collègues : REA-340, 341, 345, 350, 351) sont ouvertes à tous.
  // Pour un prochain essai, remettre `estSuperAdmin(g.email)` ici et dans les actions.
  const pilote = true;
  const placeInternes = pilote ? placeInternesValide((await cookies()).get(COOKIE_PLACE_INTERNES)?.value) : "meles";
  // Boîtes partagées, boîte d'envoi et agence : celles de l'agence de la personne (config
  // MAIL_TRI_BOITES, 27/10/2026) ; un super-admin voit toutes les boîtes triées.
  const superAdmin = estSuperAdmin(g.email);
  const [boite, agencePersonne] = await Promise.all([boiteDeComposition(g, superAdmin), agenceDesModeles(g.agencyId)]);
  const agence = agencePersonne ?? boite?.agences[0] ?? "";
  const [data, signatureHtml, modeles] = await Promise.all([
    getMesEmails(g, maxPerso, { superAdmin, sansBoitePerso: await incarnationEnCours() }),
    getSignatureGestionnaire(g),
    modelesMailPour(agencePersonne),
  ]);
  // « Reformuler » (ADR-051) : absent tant que IA_REFORMULATION=on et la clé ne sont pas posés.
  const reformulation = reformulationDisponible();

  return (
    <AppShell user={g} active="emails" breadcrumb="E-mails">
      <Page largeur="travail">
        {/* Le <form> n'enveloppe QUE « Actualiser » : jusqu'au 27/10/2026 il englobait aussi le
            compositeur « Envoyer un e-mail », dont chaque clic soumettait en plus une relecture
            complète des boîtes (bug B5). */}
        <div className="flex items-center gap-3">
          {/* Le chiffre unique « À traiter », publié par l'écran (29/10/2026). */}
          <div className="mr-auto flex items-baseline gap-3 flex-wrap">
            <h1 className="text-page font-medium tracking-tight text-ink">E-mails</h1>
            <ChiffreTitre />
          </div>
          <EnvoyerEmail
            gestionnaireNom={g.nomComplet}
            agence={agence}
            brouillonPossible={brouillonPossible(boite)}
            envoiDirect={envoiDirectComposition(boite)}
            boite={boiteEnvoi(boite)}
            signatureHtml={signatureHtml}
            modeles={modeles}
            pilote={pilote}
            reformulation={reformulation}
          />
          <form action={rafraichirAction}>
            <BoutonRafraichir />
          </form>
        </div>
        <MesEmailsVue
          data={data}
          signatureHtml={signatureHtml}
          adresseFactures={facturesEstaleConfigurees() ? "la boîte factures ESTALE de l'agence de la copropriété" : null}
          agence={agence}
          maxPerso={maxPerso}
          modeles={modeles}
          pilote={pilote}
          reformulation={reformulation}
          placeInternesInitiale={placeInternes}
        />
      </Page>
    </AppShell>
  );
}
