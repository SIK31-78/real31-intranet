// Modèles de mail (REA-296) : la liste et l'édition des modèles proposés dans « Envoyer un
// e-mail » et dans les réponses. Ouvert aux admins et aux responsables d'agence ; chacun ne
// modifie que les modèles des agences qu'il gère (garde serveur dans chaque action).
// Dégradation propre : table absente -> bandeau « SQL à passer ».

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { ModelesMailAdminVue } from "@/components/admin/modeles-mail-admin-vue";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estDirectionQuelquePart, pageAccueilPour, peutEditerModelesMail, profilDe } from "@/lib/auth/roles";
import { getAgenceRepository, getModeleMailRepository } from "@/lib/adapters/router";
import { ModelesMailNonConfigureError, type ModeleMailStocke } from "@/lib/domain/modeles-mail";

export const metadata: Metadata = { title: "Modèles de mail - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function ModelesMailAdminPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const profil = profilDe(g);
  if (!estDirectionQuelquePart(profil)) redirect(pageAccueilPour(g.email, g.role));

  let modeles: ModeleMailStocke[] = [];
  let nonConfigure = false;
  try {
    modeles = await getModeleMailRepository().listerTous();
  } catch (e) {
    if (e instanceof ModelesMailNonConfigureError) nonConfigure = true;
    else throw e;
  }
  const agences = (await getAgenceRepository().listerAgences().catch(() => [])).map((a) => a.code).sort();

  return (
    <AppShell user={g} active="modeles-mail" breadcrumb="Administration / Modèles de mail">
      <Page largeur="lecture">
        <PageHeader
          titre="Modèles de mail"
          aide={
            <p>
              Les modèles proposés dans « Envoyer un e-mail » et dans les réponses. Un modèle appartient à une agence ou à
              tout le cabinet. Ce sont des mails simples, écrits à une personne : les communications à toute la copropriété
              se font dans ESTALE. La signature est ajoutée par Signitic, ne la mettez pas dans le texte.
            </p>
          }
        />
        <ModelesMailAdminVue
          modeles={modeles}
          nonConfigure={nonConfigure}
          agences={agences}
          agencesEditables={agences.filter((a) => peutEditerModelesMail(profil, a))}
          cabinetEditable={peutEditerModelesMail(profil)}
        />
      </Page>
    </AppShell>
  );
}
