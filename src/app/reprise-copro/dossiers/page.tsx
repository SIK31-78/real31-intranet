// Suivi des dossiers de reprise. Server component (force-dynamic) : lit le repo memoire
// via le service suivi, projette une vue serialisable, et delegue l'affichage + la
// creation au composant client. Bandeau discret "non persistant (memoire)".
//
// ROLE : la LISTE (le suivi) est ouverte a TOUS les gestionnaires ; seule la CREATION d'un
// dossier est reservee aux admins reprise -> bouton grise cote client (cf. lib/auth/roles.ts).

import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estAdminReprise } from "@/lib/auth/roles";
import { getRepriseDossierRepository, reprisePersistanceSupabase } from "@/lib/reprise/adapters/router";
import { listerDossiers } from "@/lib/reprise/services/suivi-dossier";
import { avancement, estArchive } from "@/lib/reprise/domain/dossier";
import { DossiersRepriseVue, type DossierResume } from "./dossiers-reprise-vue";

export const dynamic = "force-dynamic";

export default async function DossiersReprisePage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const dossiers = await listerDossiers(getRepriseDossierRepository());
  const resumes: DossierResume[] = dossiers.map((d) => {
    const faites = d.etapes.filter((e) => e.statut === "fait" || e.statut === "ignore").length;
    return {
      ref: d.ref,
      nomUsuel: d.nomUsuel,
      statut: d.statut,
      archive: estArchive(d),
      avancement: avancement(d),
      etapesFaites: faites,
      etapesTotal: d.etapes.length,
      nbAnomalies: d.anomalies.length,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[20px] font-medium tracking-tight text-ink">Suivi des dossiers</h1>
        <p className="mt-1 text-[13px] text-ink-3 max-w-[640px]">
          Avancement des reprises en cours, etape par etape (patrimoine, verification, mise en service).
        </p>
      </div>

      {!reprisePersistanceSupabase() && (
        <p className="text-[12px] text-ink-3 border border-line rounded-md bg-surface-2 px-3 py-2">
          Etat non persistant (memoire) : les dossiers sont perdus au redemarrage du serveur. La persistance
          Supabase s&apos;active avec COPRO_SOURCE=supabase, sans changer cet ecran.
        </p>
      )}

      <DossiersRepriseVue dossiers={resumes} adminReprise={estAdminReprise(g.email)} />
    </div>
  );
}
