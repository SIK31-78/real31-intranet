import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant, incarnationEnCours, mailModuleActifPour } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Callout } from "@/components/ui/callout";
import { Compositeur } from "@/components/mes-emails/compositeur";
import { expediteursDeComposition, listerCoprosComposition } from "@/lib/services/mes-emails/composer-mail";
import { getSignatureGestionnaire } from "@/lib/services/mes-emails/get-signature";
import { agenceDesModeles, modelesMailPour } from "@/lib/services/mes-emails/modeles-mail";
import { reformulationDisponible } from "@/lib/services/ia/reformuler-mail";

export const metadata: Metadata = { title: "Envoyer un e-mail - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function ComposerPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!mailModuleActifPour(g.email)) redirect("/accueil");

  // Les boîtes du « De » (29/10/2026) : celle de l'agence de la personne en premier, les autres
  // boîtes partagées auxquelles elle a droit, sa boîte perso hors incarnation. Copros proposées :
  // celles de toutes ces boîtes partagées ; modèles et {{agence}} : son agence.
  const [envoi, agencePersonne] = await Promise.all([
    expediteursDeComposition(g, { superAdmin: estSuperAdmin(g.email), sansBoitePerso: await incarnationEnCours() }),
    agenceDesModeles(g.agencyId),
  ]);
  const [copros, signatureHtml, modeles] = await Promise.all([
    listerCoprosComposition(envoi.expediteurs.filter((e) => !e.personnelle)).catch(() => []),
    getSignatureGestionnaire(g),
    modelesMailPour(agencePersonne),
  ]);
  const agence = agencePersonne ?? envoi.expediteurs.find((e) => e.boite === envoi.parDefaut)?.agences[0] ?? "";

  return (
    <AppShell user={g} active="emails" breadcrumb="Envoyer un e-mail">
      <Page largeur="travail">
        <PageHeader
          titre="Envoyer un e-mail"
          meta="Un mail à une copropriété, depuis la boîte partagée de l'agence. L'objet reprend le code pour le tri."
        />
        {copros.length === 0 && (
          <Callout ton="warn">
            Aucune copropriété n&apos;est chargée pour cette boîte (vérifier l&apos;agence de la boîte dans MAIL_TRI_BOITES / la source Supabase).
          </Callout>
        )}
        <Compositeur
          copros={copros}
          gestionnaireNom={g.nomComplet}
          agence={agence}
          expediteurs={envoi.expediteurs}
          expediteurParDefaut={envoi.parDefaut}
          signatureHtml={signatureHtml}
          modeles={modeles}
          reformulation={reformulationDisponible()}
        />
      </Page>
    </AppShell>
  );
}
