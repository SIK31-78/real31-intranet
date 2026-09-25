import type { ReactNode } from "react";
import { Sidebar, type NavKey } from "@/components/layout/sidebar";
import { BarreMobile } from "@/components/layout/barre-mobile";
import { SidebarDrawer } from "@/components/layout/sidebar-drawer";
import { MobileSidebarProvider } from "@/components/layout/mobile-sidebar-context";
import { FilArianeProvider } from "@/components/ui/fil-ariane";
import { FeedbackTrigger } from "@/components/feedback/feedback-trigger";
import { getGestionnaireCourant, impersonationAutorisee, mailModuleActifPour } from "@/lib/auth/session";
import { peutVoirComptabilite, peutExporterAnnuaireLinkus, estVueComptable, estSuperAdmin, peutVoirGestionCourante, estDirection, estDirectionQuelquePart, estHorsSyndic, peutVoirPropositions, profilDe } from "@/lib/auth/roles";
import { attacherUtilisateur } from "@/lib/observabilite";
import { SentryUtilisateur } from "@/components/layout/sentry-utilisateur";

type AppShellProps = {
  user: { initiales: string; nomComplet: string };
  active: NavKey;
  breadcrumb?: string;
  children: ReactNode;
};

// Le shell (refonte, etape 3 - la peau, 2026-09-10) : UN rail de navigation sombre a
// gauche (marque, recherche Ctrl+K, nav, utilisateur), le contenu sur le papier a
// droite. La topbar blanche a disparu : le fil d'Ariane (`breadcrumb`, toujours passe
// par les 35 pages) est publie dans un contexte et rendu par <Page> en eyebrow.
// Sous md, une barre mobile minimale ouvre le rail en tiroir.
export async function AppShell({ user, active, breadcrumb, children }: AppShellProps) {
  const peutImpersonner = await impersonationAutorisee();
  // "Mes evenements" visible seulement si la vraie boite est branchee (MAIL_SOURCE=graph)
  // ET que le gestionnaire connecte fait partie des pilotes (MAIL_PILOTES, si pose).
  // getGestionnaireCourant est memoise par requete (React.cache) : appel gratuit ici.
  const g = await getGestionnaireCourant();
  // Sentry : l'evenement porte le COLLABORATEUR (id + initiales), jamais un tiers.
  attacherUtilisateur(g ? { id: g.id, initiales: g.initiales } : null);
  const emailsOuvert = mailModuleActifPour(g?.email);
  // Entree "Comptabilite" (dashboard transverse) visible seulement au pole compta
  // (COMPTABLES) et aux super-admins ; absente pour un gestionnaire normal.
  const comptaOuvert = peutVoirComptabilite(g?.email, g?.role);
  // Entree "Gestion courante" (facturation des honoraires du cabinet) : comptable
  // d'ENTREPRISE et super-admins seulement - pas le pole compta des copros.
  const gestionCouranteOuverte = peutVoirGestionCourante(g?.email);
  // Vue comptable EPUREE : le comptable pur (pas super-admin/manager/directeur) a une
  // sidebar reduite (son dashboard + copros + coffre). Les profils qui pilotent tout
  // gardent la nav complete.
  const vueComptable = estVueComptable(g?.email, g?.role);
  // Groupe "Administration" (cles API machine) : SUPER-ADMIN seulement. La page
  // /admin/cles-api porte sa propre garde serveur - l'entree sidebar n'est qu'un acces.
  const adminOuvert = estSuperAdmin(g?.email);
  // Entree "Annuaire Linkus" : ADMIN de la table User (Léa, téléphonie) + super-admin.
  const linkusOuvert = peutExporterAnnuaireLinkus(g?.email, g?.role);
  // Entree "Collaborateurs" : la direction (table User, referents d'agence, super-admin).
  const directionOuverte = g ? estDirection(profilDe(g)) : false;
  // Vue HORS SYNDIC (vente, location, accueil) : cles, coffre, nouveautes.
  const vueHorsSyndic = g ? estHorsSyndic(profilDe(g)) : false;
  // "Propositions de contrat" : les habilites et super-admin (Sekou, 21/09/2026).
  const propositionsOuvertes = g ? peutVoirPropositions(profilDe(g)) : false;
  // "Perte de copropriete" : la direction, ou qu'elle soit.
  const perteOuverte = g ? estDirectionQuelquePart(profilDe(g)) : false;
  return (
    <MobileSidebarProvider>
      <SentryUtilisateur id={g?.id ?? null} initiales={g?.initiales ?? null} />
      <FilArianeProvider valeur={breadcrumb ?? null}>
        <div className="flex flex-col min-h-screen md:flex-row">
          <BarreMobile emailsOuvert={emailsOuvert} vueHorsSyndic={vueHorsSyndic} />
          {/* Sous md: le rail est un tiroir masque par defaut (SidebarDrawer), ouvert par
              la barre mobile. Des md: colonne statique, pleine hauteur, toujours visible. */}
          <SidebarDrawer>
            <Sidebar
              active={active}
              user={user}
              peutImpersonner={peutImpersonner}
              emailsOuvert={emailsOuvert}
              comptaOuvert={comptaOuvert}
              linkusOuvert={linkusOuvert}
              gestionCouranteOuverte={gestionCouranteOuverte}
              vueComptable={vueComptable}
              vueHorsSyndic={vueHorsSyndic}
              propositionsOuvertes={propositionsOuvertes}
              perteOuverte={perteOuverte}
              adminOuvert={adminOuvert}
              directionOuverte={directionOuverte}
            />
          </SidebarDrawer>
          <main className="flex-1 min-w-0 min-h-0">{children}</main>
          {/* Bouton flottant "Signaler un bug / une idee", present sur toutes les pages
              authentifiees. L'auteur et la page courante sont capturees automatiquement. */}
          <FeedbackTrigger />
        </div>
      </FilArianeProvider>
    </MobileSidebarProvider>
  );
}
