import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMesEmails } from "@/lib/services/mes-emails/get-mes-emails";
import { getGestionnaireCourant, mailModuleActifPour, incarnationEnCours } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { MesEmailsVue, type MailOuvert } from "@/components/mes-emails/mes-emails-vue";
import { getSignatureGestionnaire } from "@/lib/services/mes-emails/get-signature";
import { agenceDesModeles, modelesMailPour } from "@/lib/services/mes-emails/modeles-mail";
import { facturesEstaleConfigurees } from "@/lib/services/mes-emails/transmettre-facture";
import { rafraichirAction } from "./actions";
import { BoutonRafraichir } from "./bouton-rafraichir";
import { Page } from "@/components/ui/page";
import { EnvoyerEmail } from "@/components/mes-emails/envoyer-email";
import { ChiffreTitre } from "@/components/mes-emails/chiffre-a-traiter";
import { expediteursDeComposition } from "@/lib/services/mes-emails/composer-mail";
import { reformulationDisponible } from "@/lib/services/ia/reformuler-mail";
import { equipeDeLEcran } from "@/lib/services/mes-emails/equipe-ecran";
import { depotBpoActif } from "@/lib/services/mes-emails/depot-bpo";
import { lireMailUnique } from "@/lib/services/mes-emails/lire-boites";
import type { MesEmails } from "@/lib/domain/mes-emails";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { boiteDuMailLisible } from "./gardes-boites";

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

/**
 * « Répondre » depuis « Échanges » (décision Sekou du 02/11/2026) : /mes-emails?boite=…&mail=…
 * ouvre ce mail, même absent de la liste (pas distribué à mon binôme, plus vieux, rangé, conclu,
 * ou envoyé), si la boîte est l'une de mes boîtes de l'écran ET que je peux la fouiller dans
 * « Échanges » (boiteDuMailLisible). Lecture seule ici : rien n'est écrit.
 */
async function mailDepuisEchanges(g: Gestionnaire, boite: string | undefined, mid: string, data: MesEmails): Promise<MailOuvert> {
  const lisible = await boiteDuMailLisible(g, boite, mid);
  if (!lisible) return { erreur: "Ce mail n'est pas dans une boîte que vous pouvez lire ici : répondez depuis Outlook." };
  const present = data.mails.find((m) => m.id === mid && m.boite === lisible.boite);
  if (present) return { mail: present, distribue: lisible.distribue };
  const b = data.boites.find((x) => x.id === lisible.boite);
  if (!b) return { erreur: "Cette boîte n'est pas affichée dans l'écran E-mails : répondez depuis Outlook." };
  try {
    const mail = await lireMailUnique(g, b, mid);
    return mail ? { mail, distribue: lisible.distribue } : { erreur: "Ce mail n'est plus dans la boîte (supprimé ou déplacé ailleurs)." };
  } catch {
    return { erreur: "Ce mail n'a pas pu être lu dans la boîte. Réessayez, ou répondez depuis Outlook." };
  }
}

export default async function MesEmailsPage({ searchParams }: { searchParams: Promise<{ plus?: string; boite?: string; mail?: string }> }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  // Module grise en prod tant que la vraie boite n'est pas branchee (MAIL_SOURCE=graph),
  // et reserve aux pilotes si MAIL_PILOTES est pose (deploiement pilote).
  if (!mailModuleActifPour(g.email)) redirect("/accueil");
  const sp = await searchParams;
  const maxPerso = plafondPerso(sp.plus);
  const mid = typeof sp.mail === "string" && sp.mail.trim() && sp.mail.length <= 600 ? sp.mail.trim() : null;
  const boiteDemandee = typeof sp.boite === "string" && sp.boite.length <= 320 ? sp.boite : undefined;
  // PILOTE (16/10/2026) : le 15/10, un changement d'affichage de cet écran mis en prod sans
  // avoir été vu a fait appeler toute l'agence. Toute nouveauté visible passe d'abord par
  // le super-admin ; les actions serveur de ces nouveautés refusent aussi les autres.
  // 21/10/2026 : les cinq nouveautés du pilote (corbeille groupée, Envoyés, mise en forme,
  // Transférer, place des collègues : REA-340, 341, 345, 350, 351) sont ouvertes à tous.
  // Pour un prochain essai, remettre `estSuperAdmin(g.email)` ici et dans les actions.
  const pilote = true;
  // Boîtes partagées, boîtes d'envoi et agence : celles de l'agence de la personne (config
  // MAIL_TRI_BOITES, 27/10/2026) ; un super-admin voit toutes les boîtes triées. « De » du
  // nouveau mail (29/10/2026) : ces boîtes, celles d'un comptable, et la boîte perso hors incarnation.
  const superAdmin = estSuperAdmin(g.email);
  const incarnation = await incarnationEnCours();
  const [envoi, agencePersonne] = await Promise.all([
    expediteursDeComposition(g, { superAdmin, sansBoitePerso: incarnation }),
    agenceDesModeles(g.agencyId),
  ]);
  const agence = agencePersonne ?? envoi.expediteurs.find((e) => e.boite === envoi.parDefaut)?.agences[0] ?? "";
  const [data, signatureHtml, modeles] = await Promise.all([
    getMesEmails(g, maxPerso, { superAdmin, sansBoitePerso: incarnation }),
    getSignatureGestionnaire(g),
    modelesMailPour(agencePersonne),
  ]);
  const mailOuvert = mid ? await mailDepuisEchanges(g, boiteDemandee, mid, data) : null;
  // Boîte d'équipe (ADR-053) : attribution, notes, attente des mails affichés, relances dues.
  // Sans les tables : inactive, l'écran se comporte comme avant.
  const equipe = await equipeDeLEcran({ ...(g.email ? { email: g.email } : {}), ...(g.role ? { role: g.role } : {}) }, data.mails, data.boites);
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
            expediteurs={envoi.expediteurs}
            expediteurParDefaut={envoi.parDefaut}
            signatureHtml={signatureHtml}
            modeles={modeles}
            pilote={pilote}
            reformulation={reformulation}
            relance={equipe.actif}
          />
          <form action={rafraichirAction}>
            <BoutonRafraichir />
          </form>
        </div>
        <MesEmailsVue
          // Un autre mail ouvert depuis « Échanges » : l'écran repart de lui.
          key={mid ? `mail:${boiteDemandee ?? ""}|${mid}` : "boites"}
          data={data}
          mailOuvert={mailOuvert}
          signatureHtml={signatureHtml}
          adresseFactures={facturesEstaleConfigurees() ? "la boîte factures ESTALE de l'agence de la copropriété" : null}
          agence={agence}
          maxPerso={maxPerso}
          modeles={modeles}
          pilote={pilote}
          reformulation={reformulation}
          equipe={equipe}
          incarnation={incarnation}
          depotBpo={depotBpoActif()}
        />
      </Page>
    </AppShell>
  );
}
