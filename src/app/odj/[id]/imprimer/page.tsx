import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getOdj } from "@/lib/services/odj/get-odj";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { BoutonImprimer } from "@/components/odj/bouton-imprimer";
import { DocumentOdj } from "@/components/odj/document-odj";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "ODJ (impression) - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Vue document de l'ODJ : mise en page sobre pensee pour l'impression (PDF via le
// navigateur). Rendu partage avec l'apercu live (DocumentOdj).
//
// Ecran STRICTEMENT en lecture (aucune action), donc au perimetre de LECTURE comme
// /odj/[id] : un collegue qui consulte l'ODJ doit pouvoir l'imprimer. Sans ca, le bouton
// "Version imprimable" de l'ecran precedent l'envoyait sur un 404.

export default async function OdjImprimerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const odj = await getOdj(id, g.id, { transverse: true });
  if (!odj) notFound();

  return (
    <div className="min-h-screen bg-white text-ink">
      {/* Barre d'actions, masquee a l'impression */}
      <div className="print:hidden border-b border-line bg-surface-2">
        <div className="mx-auto max-w-[800px] px-6 h-12 flex items-center justify-between">
          <ButtonLink href={`/odj/${id}`} variant="ghost">
            <ArrowLeft strokeWidth={1.5} />
            Retour à l&apos;ODJ
          </ButtonLink>
          <BoutonImprimer />
        </div>
      </div>

      <div className="mx-auto max-w-[800px] px-6 py-10 print:px-0 print:py-0">
        <DocumentOdj odj={odj} />
      </div>
    </div>
  );
}
