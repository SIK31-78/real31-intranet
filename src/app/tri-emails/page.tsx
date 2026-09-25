import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant, estSuperAdmin } from "@/lib/auth/session";
import { lireFileATrier } from "@/lib/services/tri-emails/lire-file";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { TriEmailsVue } from "@/components/tri-emails/tri-emails-vue";

export const metadata: Metadata = { title: "Tri des e-mails - REAL31 Intranet" };

// La file est la boite de reception lue en direct : jamais de rendu statique.
export const dynamic = "force-dynamic";

export default async function TriEmailsPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  // Pilote (ADR-043) : super-admins seulement, et seulement si la boite est configuree.
  if (!estSuperAdmin(g.email)) redirect("/accueil");
  const file = await lireFileATrier();
  if (!file) redirect("/accueil");

  return (
    <AppShell user={g} active="tri-emails" breadcrumb="Tri des e-mails">
      <Page largeur="travail">
        <PageHeader
          titre="Tri des e-mails"
          badge={<Badge ton="outline">{file.boite === "echantillon" ? "Échantillon fictif" : file.boite}</Badge>}
          meta={`${file.mails.length} ${file.mails.length > 1 ? "mails" : "mail"} dans la boîte de réception · copropriétés ESTALE : ${file.copros.length}`}
          aide={
            <p className="max-w-[65ch] text-ink-2">
              La file, c&apos;est la boîte de réception de la boîte générique. Pour chaque mail, l&apos;intranet propose
              une copropriété ESTALE ; en l&apos;attribuant, le mail partira dans le dossier du gestionnaire, où
              l&apos;équipe le traite et y répond depuis Outlook. Cette première version est en lecture seule : rien
              n&apos;est déplacé.
            </p>
          }
        />
        {file.erreur && <Callout ton="warn">{file.erreur}</Callout>}
        <TriEmailsVue file={file} />
      </Page>
    </AppShell>
  );
}
