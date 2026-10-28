import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Callout } from "@/components/ui/callout";
import { Compositeur } from "@/components/mes-emails/compositeur";
import { boiteDeComposition, boiteEnvoi, brouillonPossible, envoiDirectComposition, listerCoprosComposition } from "@/lib/services/mes-emails/composer-mail";
import { getSignatureGestionnaire } from "@/lib/services/mes-emails/get-signature";
import { agenceDesModeles, modelesMailPour } from "@/lib/services/mes-emails/modeles-mail";
import { reformulationDisponible } from "@/lib/services/ia/reformuler-mail";

export const metadata: Metadata = { title: "Envoyer un e-mail - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function ComposerPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!mailModuleActifPour(g.email)) redirect("/accueil");

  // La boîte triée de l'agence de la personne et son agence (27/10/2026) : boîte d'envoi,
  // copros proposées, modèles et {{agence}}.
  const [boite, agencePersonne] = await Promise.all([boiteDeComposition(g, estSuperAdmin(g.email)), agenceDesModeles(g.agencyId)]);
  const [copros, signatureHtml, modeles] = await Promise.all([
    listerCoprosComposition(boite).catch(() => []),
    getSignatureGestionnaire(g),
    modelesMailPour(agencePersonne),
  ]);
  const agence = agencePersonne ?? boite?.agences[0] ?? "";

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
          brouillonPossible={brouillonPossible(boite)}
          envoiDirect={envoiDirectComposition(boite)}
          boite={boiteEnvoi(boite)}
          signatureHtml={signatureHtml}
          modeles={modeles}
          reformulation={reformulationDisponible()}
        />
      </Page>
    </AppShell>
  );
}
