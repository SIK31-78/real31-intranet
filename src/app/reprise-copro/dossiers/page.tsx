// TABLEAU D'ÉQUIPE des reprises (ADR-037). Server component (force-dynamic) : liste les
// dossiers, les résume (avancement, phase, étape courante, bloqués, retards) et compte les
// étapes qui reviennent à l'utilisateur courant. L'affichage, les filtres et la création
// vivent dans le composant client.
//
// RÔLE : la liste est ouverte à TOUS les gestionnaires (tableau partagé, aucun cloisonnement) ;
// seule la CRÉATION d'un dossier est réservée aux admins reprise (cf. lib/auth/roles.ts).

import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estAdminReprise } from "@/lib/auth/roles";
import { getRepriseDossierRepository, reprisePersistanceSupabase } from "@/lib/reprise/adapters/router";
import { listerDossiers } from "@/lib/reprise/services/suivi-dossier";
import { resumerDossier, etapesAssigneesA } from "@/lib/reprise/services/resume-dossier";
import { listerCollaborateurs } from "@/app/reprise-copro/collaborateurs";
import { DossiersRepriseVue, type LigneDossierVue } from "./dossiers-reprise-vue";
import { PageHeader } from "@/components/ui/page";
import { Callout } from "@/components/ui/callout";

export const dynamic = "force-dynamic";

export default async function DossiersReprisePage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const aujourdHui = new Date().toISOString().slice(0, 10);
  const [dossiers, collaborateurs] = await Promise.all([
    listerDossiers(getRepriseDossierRepository()),
    listerCollaborateurs(),
  ]);

  const lignes: LigneDossierVue[] = dossiers.map((d) => ({
    ...resumerDossier(d, aujourdHui),
    mesEtapesRestantes: etapesAssigneesA(d, g.id).filter((e) => e.statut !== "fait" && e.statut !== "ignore").length,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titre="Reprises de copropriété"
        meta="Où en est chaque reprise, qui tient l'étape en cours, ce qui bloque."
      />

      {!reprisePersistanceSupabase() && (
        <Callout ton="warn" titre="État non persistant">
          les dossiers sont perdus au redémarrage du serveur (COPRO_SOURCE=supabase active la persistance).
        </Callout>
      )}

      <DossiersRepriseVue
        lignes={lignes}
        collaborateurs={collaborateurs}
        moi={{ id: g.id, nom: g.nomComplet }}
        aujourdHui={aujourdHui}
        adminReprise={estAdminReprise(g.email)}
      />
    </div>
  );
}
