// Panneau d'administration des REMONTEES (bug / idée) = la roadmap de travail de Sekou.
// RESERVE SUPER-ADMIN : garde serveur ici (redirect) + garde dans chaque action.
// Degradation propre : table intranet_feedback absente -> bandeau "SQL a passer".

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { FeedbackAdminVue } from "@/components/admin/feedback-admin-vue";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { getFeedbackAdmin } from "@/lib/services/feedback/get-feedback-admin";
import { FeedbackNonConfigureError, type Feedback } from "@/lib/domain/feedback";

export const metadata: Metadata = { title: "Feedback - REAL31 Intranet" };

export const dynamic = "force-dynamic";

export default async function FeedbackAdminPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!estSuperAdmin(g.email)) redirect("/accueil");

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
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <h1 className="text-[20px] font-medium tracking-tight text-ink mb-1">Feedback</h1>
        <p className="text-[13px] text-ink-3 mb-4">
          Les remontées des collaborateurs (bugs et idées). Trie, priorise, fais avancer le statut —
          ce qui passe en « prévu », « en cours » ou « livré » apparaît dans la page{" "}
          <span className="font-medium">Nouveautés</span> (sans jamais l&apos;auteur ni le détail interne).
        </p>
        <FeedbackAdminVue feedbacks={feedbacks} feedbackNonConfigure={feedbackNonConfigure} />
      </div>
    </AppShell>
  );
}
