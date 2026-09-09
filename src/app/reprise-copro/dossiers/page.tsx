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
      <div>
        <h1 className="text-[20px] font-medium tracking-tight text-ink">Reprises de copropriété</h1>
        <p className="mt-1 text-[13px] text-ink-3 max-w-[640px]">
          Où en est chaque reprise, qui tient l&apos;étape en cours, ce qui bloque.
        </p>
      </div>

      {!reprisePersistanceSupabase() && (
        <p className="text-[12px] text-ink-3 border border-line rounded-md bg-surface-2 px-3 py-2">
          État non persistant (mémoire) : les dossiers sont perdus au redémarrage du serveur. La persistance
          Supabase s&apos;active avec COPRO_SOURCE=supabase, sans changer cet écran.
        </p>
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
