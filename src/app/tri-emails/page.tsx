import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant, estSuperAdmin } from "@/lib/auth/session";
import { lireFileATrier } from "@/lib/services/tri-emails/lire-file";
import { diagnosticAnnuaire } from "@/lib/services/synchro/surveiller-annuaire";
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
  // Pilote (ADR-046) : super-admins seulement, et seulement si la boite est configuree.
  if (!estSuperAdmin(g.email)) redirect("/accueil");
  const [file, annuaire] = await Promise.all([lireFileATrier(), diagnosticAnnuaire()]);
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
              une copropriété ESTALE ; en le rangeant, le mail part dans le dossier du binôme (ou dans
              Comptabilité / Divers), où l&apos;équipe le traite et y répond depuis Outlook. L&apos;onglet « Rangés
              sur 7 jours » sert à la revue du vendredi : chaque rangement y montre le signal qui l&apos;a proposé.
            </p>
          }
        />
        {file.simulation && (
          <Callout ton="info" titre="Mode simulation.">
            {" "}Les rangements sont notés au journal, mais aucun mail ne bouge dans la boîte.
          </Callout>
        )}
        {file.erreur && <Callout ton="warn">{file.erreur}</Callout>}
        {annuaire.alerte && (
          <Callout ton="warn" titre="Annuaire des expéditeurs Crypto pas à jour.">
            {" "}{annuaire.raisons.join(" ")} Pour relancer : double-clic sur{" "}
            <code>scripts\sync-annuaire-crypto.cmd</code>, sur le PC qui synchronise l&apos;export Crypto.
          </Callout>
        )}
        <TriEmailsVue file={file} />
      </Page>
    </AppShell>
  );
}
