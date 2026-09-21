import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { ecranDelegations } from "@/lib/services/delegations/delegations";
import { niveauEcriture } from "@/lib/domain/perimetre-ecriture";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { BlocDelegations } from "./bloc-delegations";

export const metadata: Metadata = { title: "Délégations - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Les delegations d'ecriture (ADR-041) : qui remplace qui, sur quoi, jusqu'a quand. Ouverte
// a tout le cabinet : chacun voit les siennes (donnees ou recues) et peut deleguer son
// propre portefeuille ; la direction voit et pose celles de son agence.

export default async function DelegationsPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const ecran = await ecranDelegations(g.id, estSuperAdmin(g.email));
  if (!ecran) redirect("/accueil");
  const niveau = niveauEcriture(ecran.auteur);

  return (
    <AppShell user={g} active="collaborateurs" breadcrumb="Délégations">
      <Page largeur="travail">
        <PageHeader
          titre="Délégations"
          eyebrow={niveau === "cabinet" ? "Tout le cabinet" : niveau === "agence" ? `Votre agence (${ecran.agences.filter((a) => ecran.auteur.agenceCode === a).join(", ") || ecran.auteur.agenceCode})` : "Votre portefeuille"}
          aide={
            <p>
              Une délégation donne à quelqu&apos;un le droit d&apos;écrire sur les copropriétés d&apos;un autre : dates, ODJ, récap AG, contrat,
              facturation, tout ce que le titulaire ferait. Elle a un début, une fin et un motif, et se retire à tout moment. Un
              congé, un binôme, un remplacement : on la pose ici, elle expire toute seule.
            </p>
          }
        />

        <BlocDelegations ecran={ecran} moi={g.id} />
      </Page>
    </AppShell>
  );
}
