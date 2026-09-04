import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getOdj } from "@/lib/services/odj/get-odj";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { BoutonImprimer } from "@/components/odj/bouton-imprimer";
import { DocumentOdj } from "@/components/odj/document-odj";

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
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Barre d'actions, masquee a l'impression */}
      <div className="print:hidden border-b border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-[800px] px-6 py-3 flex items-center justify-between">
          <Link
            href={`/odj/${id}`}
            className="inline-flex items-center gap-1.5 text-[13px] text-neutral-600 hover:text-neutral-900"
          >
            <ArrowLeft strokeWidth={1.5} className="w-3.5 h-3.5" />
            Retour à l&apos;édition
          </Link>
          <BoutonImprimer />
        </div>
      </div>

      <div className="mx-auto max-w-[800px] px-6 py-10 print:px-0 print:py-0">
        <DocumentOdj odj={odj} />
      </div>
    </div>
  );
}
