import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getContrat } from "@/lib/services/contrat/get-contrat";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { BoutonImprimer } from "@/components/odj/bouton-imprimer";
import { DocumentContrat } from "@/components/contrat/document-contrat";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

export const metadata: Metadata = { title: "Contrat de syndic (impression) - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Le contrat de syndic en vue document, pense pour l'impression (PDF via le navigateur) :
// c'est le meme socle que l'ODJ imprimable, la seule voie de production de document du
// projet. Remplace le detour Excel + OneDrive du flow PowerApps MYTHEC.
//
// Ecran STRICTEMENT en lecture : au perimetre de lecture, comme l'ODJ.

export default async function ContratImprimerPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ ag?: string; honoraires?: string; timbres?: string }>;
}) {
  const { code } = await params;
  const { ag, honoraires, timbres } = await searchParams;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  // Les ajustements de l'ecran de preparation voyagent en query : le document reste une
  // page SERVEUR sans etat, imprimable et partageable par son URL.
  const nombreOuUndefined = (v?: string) => {
    const n = Number(v);
    return v !== undefined && Number.isFinite(n) ? n : undefined;
  };

  let champs;
  try {
    champs = await getContrat(code, {
      ...(ag ? { dateAgISO: ag } : {}),
      ...(nombreOuUndefined(honoraires) !== undefined
        ? { honorairesGestionTtc: nombreOuUndefined(honoraires)! }
        : {}),
      ...(nombreOuUndefined(timbres) !== undefined
        ? { forfaitPostauxTtc: nombreOuUndefined(timbres)! }
        : {}),
    });
  } catch (e) {
    const message = (e as Error).message;
    // Copro inconnue : c'est un 404. Toute autre cause (mandat sans date de fin, bareme
    // incomplet, honoraires absents) est ACTIONNABLE : on la dit, on ne 404 pas.
    if (/introuvable/.test(message)) notFound();
    return (
      <div className="min-h-screen bg-white p-10">
        <div className="mx-auto max-w-[800px] flex flex-col gap-4">
          <Callout ton="err" titre="Contrat impossible à éditer">
            {message}
          </Callout>
          <ButtonLink href={`/copropriete/${code}`} variant="secondary">
            <ArrowLeft strokeWidth={1.5} />
            Retour à la copropriété
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-ink">
      {/* Barre d'actions, masquee a l'impression */}
      <div className="print:hidden border-b border-line bg-surface-2">
        <div className="mx-auto max-w-[1000px] px-6 h-12 flex items-center justify-between">
          <ButtonLink href={`/copropriete/${code}`} variant="ghost">
            <ArrowLeft strokeWidth={1.5} />
            Retour à la copropriété
          </ButtonLink>
          <BoutonImprimer />
        </div>
      </div>

      {/* Le contrat est en DEUX colonnes : il lui faut plus de largeur que l'ODJ. */}
      <div className="mx-auto max-w-[1000px] px-6 py-10 print:px-0 print:py-0 print:max-w-none">
        <DocumentContrat champs={champs} />
      </div>
    </div>
  );
}
