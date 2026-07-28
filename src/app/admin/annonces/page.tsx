// Panneau d'administration des ANNONCES reseau (affichees sur l'accueil de tous).
// RESERVE SUPER-ADMIN : garde serveur ici (redirect) + garde dans chaque action.
// Degradation propre : table intranet_annonces absente -> bandeau "SQL a passer".

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AnnoncesAdminVue } from "@/components/admin/annonces-admin-vue";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin, pageAccueilPour } from "@/lib/auth/roles";
import { getAnnonceRepository, getAgenceRepository, getGestionnaireRepository } from "@/lib/adapters/router";
import { AnnoncesNonConfigureError, type Annonce } from "@/lib/domain/annonce";

export const metadata: Metadata = { title: "Annonces - REAL31 Intranet" };

export const dynamic = "force-dynamic";

export default async function AnnoncesAdminPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!estSuperAdmin(g.email)) redirect(pageAccueilPour(g.email, g.role));

  let annonces: Annonce[] = [];
  let nonConfigure = false;
  try {
    annonces = await getAnnonceRepository().listerToutes();
  } catch (e) {
    if (e instanceof AnnoncesNonConfigureError) nonConfigure = true;
    else throw e;
  }

  // Listes fermees pour le CIBLAGE (agences + annuaire des collaborateurs avec email).
  // Degrade en listes vides si tables absentes -> le selecteur ne propose que "tout le groupe".
  const [agences, collaborateurs] = await Promise.all([
    getAgenceRepository().listerAgences().catch(() => []),
    getGestionnaireRepository()
      .list()
      .then((tous) =>
        tous
          .filter((x) => x.email)
          .map((x) => ({ email: x.email as string, nom: x.nomComplet })),
      )
      .catch(() => []),
  ]);

  return (
    <AppShell user={g} active="annonces" breadcrumb="Administration / Annonces">
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 md:px-8 md:py-8">
        <h1 className="text-[20px] font-medium tracking-tight text-ink mb-1">Annonces</h1>
        <p className="text-[13px] text-ink-3 mb-4">
          Les messages du réseau affichés sur l&apos;<span className="font-medium">accueil</span> de tous les
          collaborateurs. Une annonce active apparaît en haut de leur accueil ; désactive-la pour la retirer
          sans la supprimer.
        </p>
        <AnnoncesAdminVue
          annonces={annonces}
          nonConfigure={nonConfigure}
          agences={agences.map((a) => a.code)}
          collaborateurs={collaborateurs}
        />
      </div>
    </AppShell>
  );
}
