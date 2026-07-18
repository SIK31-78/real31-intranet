// Ecran de REVUE / VALIDATION du mapping comptable (increment 3). Server component
// (force-dynamic) : garde d'auth (meme que la reprise patrimoine), puis delegue tout a un
// composant client qui pilote l'upload du grand livre + l'affichage/edition du plan de mapping.
//
// ROLE : cet ecran est ENTIEREMENT un outil d'ADMIN REPRISE (directeur / manager / super-admin).
// Un gestionnaire n'est PAS redirige (il verrait un ecran disparaitre sans comprendre) : il voit
// la page avec un panneau "reserve" a la place de l'outil. La garde reelle est cote serveur
// (route /api/reprise/mapping-analyser + actions de decision). Cf. lib/auth/roles.ts.
//
// AUCUNE ecriture eStale ici : l'ecran prepare et fige les decisions humaines ; l'import reel
// sera l'increment suivant.

import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estAdminReprise } from "@/lib/auth/roles";
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

  if (!estAdminReprise(g.email)) return <MappingReserve />;

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

/** Ce que voit un gestionnaire non-admin : la fonction existe, elle est juste reservee. */
function MappingReserve() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[20px] font-medium tracking-tight text-ink">Reprise comptable - revue du mapping</h1>
        <p className="mt-1 text-[13px] text-ink-3 max-w-[720px]">
          Analyse du grand livre N-1 du syndic sortant et mapping de chaque compte source vers eStale, avant
          l&apos;import comptable.
        </p>
      </div>

      <div className="rounded-md border border-line bg-surface-2 px-4 py-4">
        <div className="flex items-start gap-2.5">
          <Lock strokeWidth={1.5} className="w-4 h-4 mt-0.5 shrink-0 text-ink-4" />
          <div>
            <p className="text-[13px] font-medium text-ink">Réservé aux directeurs et managers.</p>
            <p className="mt-1 text-[12.5px] text-ink-3 max-w-[640px]">
              La revue du mapping tranche la reprise comptable d&apos;une copropriété (rattachement des comptes 401 /
              450, décisions figées avant import). Elle est pilotée par l&apos;encadrement. Tu peux suivre
              l&apos;avancement de chaque reprise depuis le suivi des dossiers.
            </p>
            <Link
              href="/reprise-copro/dossiers"
              className="mt-2.5 inline-flex items-center h-8 px-3 rounded-md border border-line text-[12.5px] text-ink-2 hover:bg-surface transition-colors"
            >
              Aller au suivi des dossiers
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
