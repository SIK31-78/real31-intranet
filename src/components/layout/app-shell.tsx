import type { ReactNode } from "react";
import { Sidebar, type NavKey } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getGestionnaireCourant, impersonationAutorisee, mailModuleActifPour } from "@/lib/auth/session";
import { peutVoirComptabilite } from "@/lib/auth/roles";

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
  const comptaOuvert = peutVoirComptabilite(g?.email);
  return (
    <div className="flex flex-col min-h-screen">
      <Topbar user={user} breadcrumb={breadcrumb} peutImpersonner={peutImpersonner} emailsOuvert={emailsOuvert} />
      <div className="flex flex-1 min-h-0">
        <Sidebar active={active} emailsOuvert={emailsOuvert} comptaOuvert={comptaOuvert} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
