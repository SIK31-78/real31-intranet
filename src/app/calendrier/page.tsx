import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEvenements } from "@/lib/services/calendrier/get-calendrier";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { CalendrierVue } from "@/components/calendrier/calendrier-vue";
import { Page, PageHeader } from "@/components/ui/page";
import { COOKIE_AGENDA_OUTLOOK } from "@/components/calendrier/preference-agenda";

export const metadata: Metadata = { title: "Calendrier AG/CS - REAL31 Intranet" };

// Lit la vraie data en mode supabase : rendu a la demande.
export const dynamic = "force-dynamic";

export default async function CalendrierPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  // Vraie data : aujourd'hui reel ; mock : ancre calee sur les donnees mockees (2026-05-27).
  const aujourdhuiISO =
    process.env.COPRO_SOURCE === "supabase"
      ? new Date().toISOString().slice(0, 10)
      : "2026-05-27";
  const evenements = await getEvenements(g.id);
  // Preference "afficher mon agenda Outlook", lue AVANT le rendu : la case sort deja dans
  // le bon etat, sans correction apres coup ni clignotement (cf. preference-agenda).
  const agendaOutlookParDefaut =
    (await cookies()).get(COOKIE_AGENDA_OUTLOOK)?.value === "1";

  return (
    <AppShell user={g} active="calendrier" breadcrumb="Calendrier AG/CS">
      <Page largeur="travail">
        <PageHeader titre="Calendrier AG/CS" />
        <CalendrierVue
          evenements={evenements}
          aujourdhuiISO={aujourdhuiISO}
          agendaOutlookParDefaut={agendaOutlookParDefaut}
        />
      </Page>
    </AppShell>
  );
}
