// Panneau d'administration des REMONTEES (bug / idée) = la roadmap de travail de Sekou.
// RESERVE SUPER-ADMIN : garde serveur ici (redirect) + garde dans chaque action.
// Degradation propre : table intranet_feedback absente -> bandeau "SQL a passer".

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { FeedbackAdminVue } from "@/components/admin/feedback-admin-vue";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin, pageAccueilPour } from "@/lib/auth/roles";
import { getFeedbackAdmin } from "@/lib/services/feedback/get-feedback-admin";
import { FeedbackNonConfigureError, type Feedback } from "@/lib/domain/feedback";
import { Page, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = { title: "Feedback - REAL31 Intranet" };

export const dynamic = "force-dynamic";

export default async function FeedbackAdminPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!estSuperAdmin(g.email)) redirect(pageAccueilPour(g.email, g.role));

  let feedbacks: Feedback[] = [];
  let feedbackNonConfigure = false;
  try {
    feedbacks = await getFeedbackAdmin();
  } catch (e) {
    if (e instanceof FeedbackNonConfigureError) feedbackNonConfigure = true;
    else throw e;
  }

  return (
    <AppShell user={g} active="feedback" breadcrumb="Administration / Feedback">
      <Page largeur="travail">
        <PageHeader
          titre="Feedback"
          aide={
            <p>
              Les remontées des collaborateurs (bugs et idées). Triez, priorisez, faites avancer le statut : ce qui
              passe en « prévu », « en cours » ou « livré » apparaît dans la page Nouveautés (sans jamais
              l&apos;auteur ni le détail interne).
            </p>
          }
        />
        <FeedbackAdminVue feedbacks={feedbacks} feedbackNonConfigure={feedbackNonConfigure} />
      </Page>
    </AppShell>
  );
}
