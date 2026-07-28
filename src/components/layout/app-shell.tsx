import type { ReactNode } from "react";
import { Sidebar, type NavKey } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { SidebarDrawer } from "@/components/layout/sidebar-drawer";
import { MobileSidebarProvider } from "@/components/layout/mobile-sidebar-context";
import { FeedbackTrigger } from "@/components/feedback/feedback-trigger";
import { getGestionnaireCourant, impersonationAutorisee, mailModuleActifPour } from "@/lib/auth/session";
import { peutVoirComptabilite, estVueComptable, estSuperAdmin } from "@/lib/auth/roles";

type AppShellProps = {
  user: { initiales: string; nomComplet: string };
  active: NavKey;
  breadcrumb?: string;
  children: ReactNode;
};

export async function AppShell({ user, active, breadcrumb, children }: AppShellProps) {
  const peutImpersonner = await impersonationAutorisee();
  // "Mes evenements" visible seulement si la vraie boite est branchee (MAIL_SOURCE=graph)
  // ET que le gestionnaire connecte fait partie des pilotes (MAIL_PILOTES, si pose).
  // getGestionnaireCourant est memoise par requete (React.cache) : appel gratuit ici.
  const g = await getGestionnaireCourant();
  const emailsOuvert = mailModuleActifPour(g?.email);
  // Entree "Comptabilite" (dashboard transverse) visible seulement au pole compta
  // (COMPTABLES) et aux super-admins ; absente pour un gestionnaire normal.
  const comptaOuvert = peutVoirComptabilite(g?.email, g?.role);
  // Vue comptable EPUREE : le comptable pur (pas super-admin/manager/directeur) a une
  // sidebar reduite (son dashboard + copros + coffre). Les profils qui pilotent tout
  // gardent la nav complete.
  const vueComptable = estVueComptable(g?.email, g?.role);
  // Groupe "Administration" (cles API machine) : SUPER-ADMIN seulement. La page
  // /admin/cles-api porte sa propre garde serveur - l'entree sidebar n'est qu'un acces.
  const adminOuvert = estSuperAdmin(g?.email);
  return (
    <MobileSidebarProvider>
      <div className="flex flex-col min-h-screen">
        <Topbar user={user} breadcrumb={breadcrumb} peutImpersonner={peutImpersonner} emailsOuvert={emailsOuvert} />
        <div className="flex flex-1 min-h-0">
          {/* Sous md: la sidebar est un tiroir masque par defaut (SidebarDrawer),
              ouvert par le bouton hamburger de la Topbar. Des md: comportement
              d'origine inchange (colonne statique toujours visible). */}
          <SidebarDrawer>
            <Sidebar active={active} emailsOuvert={emailsOuvert} comptaOuvert={comptaOuvert} vueComptable={vueComptable} adminOuvert={adminOuvert} />
          </SidebarDrawer>
          <main className="flex-1 overflow-auto min-w-0">{children}</main>
        </div>
        {/* Bouton flottant "Signaler un bug / une idée", present sur toutes les pages
            authentifiees. L'auteur et la page courante sont capturees automatiquement. */}
        <FeedbackTrigger />
      </div>
    </MobileSidebarProvider>
  );
}
