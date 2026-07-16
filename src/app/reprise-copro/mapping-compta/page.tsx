// Ecran de REVUE / VALIDATION du mapping comptable (increment 3). Server component
// (force-dynamic) : garde d'auth (meme que la reprise patrimoine), puis delegue tout a un
// composant client qui pilote l'upload du grand livre + l'affichage/edition du plan de mapping.
//
// AUCUNE ecriture eStale ici : l'ecran prepare et fige les decisions humaines ; l'import reel
// sera l'increment suivant.

import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { modeExtraction, reprisePersistanceSupabase } from "@/lib/reprise/adapters/router";
import { RevueMappingVue } from "./revue-mapping-vue";

export const dynamic = "force-dynamic";

export default async function MappingComptaPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  // Ref pre-remplie depuis le bandeau "prochaine etape" de la fiche dossier (?ref=S0xxx). Bornee
  // pour eviter une valeur d'URL absurde ; le champ reste editable.
  const { ref } = await searchParams;
  const refInitiale = typeof ref === "string" ? ref.trim().slice(0, 40) : "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[20px] font-medium tracking-tight text-ink">Reprise comptable - revue du mapping</h1>
        <p className="mt-1 text-[13px] text-ink-3 max-w-[720px]">
          Depose le grand livre N-1 du syndic sortant et saisis le code copro. L&apos;IA extrait les
          ecritures (balance verifiee), puis chaque compte source est mappe vers eStale. Tranche les
          alertes ci-dessous : l&apos;ecran fige tes decisions, l&apos;import reel viendra ensuite.
        </p>
      </div>

      <RevueMappingVue modeIa={modeExtraction()} persistant={reprisePersistanceSupabase()} refInitiale={refInitiale} />
    </div>
  );
}
