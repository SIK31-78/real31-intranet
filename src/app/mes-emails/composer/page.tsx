import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Callout } from "@/components/ui/callout";
import { Compositeur } from "@/components/mes-emails/compositeur";
import { boiteEnvoi, brouillonPossible, envoiDirectComposition, listerCoprosComposition } from "@/lib/services/mes-emails/composer-mail";
import { getSignatureGestionnaire } from "@/lib/services/mes-emails/get-signature";

export const metadata: Metadata = { title: "Envoyer un e-mail - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function ComposerPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!mailModuleActifPour(g.email)) redirect("/accueil");

  const [copros, signatureHtml] = await Promise.all([listerCoprosComposition().catch(() => []), getSignatureGestionnaire(g)]);
  const agence = (process.env.MAIL_TRI_AGENCE ?? "").trim();

  return (
    <AppShell user={g} active="emails" breadcrumb="Envoyer un e-mail">
      <Page largeur="travail">
        <PageHeader
          titre="Envoyer un e-mail"
          meta="Un mail à une copropriété, depuis la boîte partagée de l'agence. L'objet reprend le code pour le tri."
        />
        {copros.length === 0 && (
          <Callout ton="warn">
            Aucune copropriété n&apos;est chargée pour cette boîte (vérifier MAIL_TRI_AGENCE / la source Supabase).
          </Callout>
        )}
        <Compositeur
          copros={copros}
          gestionnaireNom={g.nomComplet}
          agence={agence}
          brouillonPossible={brouillonPossible()}
          envoiDirect={envoiDirectComposition()}
          boite={boiteEnvoi()}
          signatureHtml={signatureHtml}
        />
      </Page>
    </AppShell>
  );
}
