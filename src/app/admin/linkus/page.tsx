import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutExporterAnnuaireLinkus, pageAccueilPour } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { BoutonExportLinkus } from "@/components/admin/bouton-export-linkus";

export const metadata: Metadata = { title: "Annuaire Linkus - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// L'annuaire des copropriétaires ESTALE pour le standard Linkus : un client ESTALE qui
// appelle l'agence s'affiche avec son nom, comme un client Crypto. ADMIN de la table User (Léa, téléphonie) et super-admins.

export default async function AnnuaireLinkusPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!peutExporterAnnuaireLinkus(g.email, g.role)) redirect(pageAccueilPour(g.email, g.role));

  return (
    <AppShell user={g} active="linkus" breadcrumb="Annuaire Linkus">
      <Page largeur="lecture">
        <PageHeader
          titre="Annuaire Linkus"
          aide={
            <p>
              Les copropriétaires ESTALE, leurs contacts et les locataires avec leur téléphone, au format
              d&apos;import de Linkus (répertoire real31_Phonebook).
            </p>
          }
        />
        <div className="space-y-6 text-sm">
          <BoutonExportLinkus />
          <div className="space-y-2">
            <p className="font-medium">Pour l&apos;importer dans Linkus</p>
            <ul className="list-disc pl-5 space-y-1 text-ink-2">
              <li>Le fichier contient tout le monde à chaque fois. Linkus refuse les contacts qu&apos;il connaît déjà et importe les nouveaux : ces refus sont normaux.</li>
              <li>Le rapport d&apos;import de Linkus liste les lignes refusées et la raison dans sa colonne ErrorCause.</li>
              <li>Un numéro modifié dans ESTALE ne remplace pas l&apos;ancien dans Linkus : il faut corriger ce contact à la main dans Linkus.</li>
              <li>Le fichier contient des données personnelles : le supprimer une fois l&apos;import fait, ne pas le transférer.</li>
            </ul>
          </div>
        </div>
      </Page>
    </AppShell>
  );
}
