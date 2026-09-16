import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { preparerOffre } from "@/lib/services/proposition/propositions";
import { BoutonImprimer } from "@/components/odj/bouton-imprimer";
import { DocumentContrat } from "@/components/contrat/document-contrat";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

export const metadata: Metadata = { title: "Contrat prospect (impression) - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Le contrat de syndic au nom d'un immeuble prospect, en vue document : meme gabarit et
// meme socle d'impression que /contrat/[code]/imprimer. Lecture seule ; les choix (AG,
// debut, duree) sont dans l'URL.

export default async function ContratProspectImprimerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ag?: string; debut?: string; duree?: string }>;
}) {
  const { id } = await params;
  const { ag, debut, duree } = await searchParams;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const jour = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const dureeMois = Number(duree);
  let offre;
  try {
    offre = await preparerOffre(
      id,
      { ...(jour(ag) ? { dateAgISO: jour(ag) } : {}), ...(jour(debut) ? { debutISO: jour(debut) } : {}), ...(Number.isInteger(dureeMois) && dureeMois > 0 ? { dureeMois } : {}) },
      { nom: g.nomComplet },
    );
  } catch (e) {
    if (/introuvable/.test((e as Error).message)) notFound();
    throw e;
  }
  const retour = `/propositions/${id}/offre`;
  if (!offre.champs) {
    return (
      <div className="min-h-screen bg-white p-10">
        <div className="mx-auto max-w-[800px] flex flex-col gap-4">
          <Callout ton="err" titre="Contrat impossible à éditer">
            {offre.erreurContrat ?? `Il manque : ${offre.obstacles.join(", ")}.`}
          </Callout>
          <ButtonLink href={retour} variant="secondary"><ArrowLeft strokeWidth={1.5} /> Retour à l&apos;offre</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-ink">
      <div className="print:hidden border-b border-line bg-surface-2">
        <div className="mx-auto max-w-[1000px] px-6 h-12 flex items-center justify-between">
          <ButtonLink href={retour} variant="ghost"><ArrowLeft strokeWidth={1.5} /> Retour à l&apos;offre</ButtonLink>
          <BoutonImprimer />
        </div>
      </div>
      <div className="mx-auto max-w-[1000px] px-6 py-10 print:px-0 print:py-0 print:max-w-none">
        <DocumentContrat champs={offre.champs} />
      </div>
    </div>
  );
}
