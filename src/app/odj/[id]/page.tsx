import type { Metadata } from "next";
import Link from "next/link";
import { Printer, ListChecks, AlertTriangle } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getOdj } from "@/lib/services/odj/get-odj";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentOdj } from "@/components/odj/document-odj";
import { DocumentOdjEditable } from "@/components/odj/document-odj-editable";
import { ClotureOdjBloc } from "@/components/odj/cloture-odj";
import { saisirChampAction, togglePointAction, cloturerOdjAction } from "./actions";

export const metadata: Metadata = { title: "ODJ - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// L'ODJ est un MODULE EDITABLE : le document s'edite sur place (cliquer une valeur,
// taper, auto-save), plus de double vue formulaire / apercu. Un ODJ clos redevient
// un document statique (le verrou serveur est dans actions.ts, ici c'est l'affichage).

export default async function OdjPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const odj = await getOdj(id, g.id);
  if (!odj) notFound();

  const onSaisir = saisirChampAction.bind(null, id);
  const onToggle = togglePointAction.bind(null, id);
  const onCloturer = cloturerOdjAction.bind(null, id);
  // Id de supervision "CODE__YYYY-MM-DD" : meme convention que partout ailleurs. On le
  // reconstruit depuis la date ISO de l'ODJ (l'URL, elle, ne la porte pas toujours :
  // /odj/SE999 vise la prochaine AG sans la nommer). Sans AG datee, pas de cible.
  const supervisionId = odj.dateAgISO ? `${odj.copro.code}__${odj.dateAgISO}` : undefined;

  return (
    <AppShell user={g} active="aucun" breadcrumb={`ODJ - ${odj.copro.nom}`}>
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 md:px-8 md:py-8 flex flex-col gap-5">
        <div>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-[22px] font-medium tracking-tight">Ordre du jour - preparation AG</h1>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/odj/${id}/composer`}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-green-700 text-surface text-[13px] font-medium hover:bg-green-600 transition-colors"
              >
                <ListChecks strokeWidth={1.5} className="w-3.5 h-3.5" />
                Composer l&apos;ODJ
              </Link>
              <Link
                href={`/odj/${id}/imprimer`}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line bg-surface text-[13px] font-medium text-ink-2 hover:border-line-2 hover:text-ink transition-colors"
              >
                <Printer strokeWidth={1.5} className="w-3.5 h-3.5" />
                Version imprimable
              </Link>
            </div>
          </div>
          <p className="text-[13px] text-ink-3 mt-1">
            {odj.copro.nom} ({odj.copro.code}){odj.dateAg ? ` - AG du ${odj.dateAg}` : ""}
          </p>
          <p className="text-[12px] text-ink-4 mt-2">
            Cliquez une valeur soulignée pour la modifier directement dans le document - la saisie
            s&apos;enregistre automatiquement (la vider rétablit la valeur automatique).
          </p>
          {!odj.dateAg && (
            <div className="mt-3 flex items-start gap-2.5 rounded-md border border-warn-500/30 bg-warn-50 px-3.5 py-2.5">
              <AlertTriangle strokeWidth={1.5} className="w-4 h-4 text-warn-700 shrink-0 mt-px" />
              <p className="text-[12.5px] text-warn-700">
                Aucune date d&apos;AG definie : les echeances (mise sous pli, convocation) ne sont pas calculees.{" "}
                <Link href={`/copropriete/${odj.copro.code}`} className="font-medium underline">
                  Definir la date sur la fiche copro
                </Link>
                .
              </p>
            </div>
          )}
        </div>

        {/* Cloture "reunion terminee" : fige l'ODJ et ouvre la supervision AG. Place en
            TETE parce que c'est l'action de sortie de cet ecran - et parce qu'une fois
            clos, le bandeau explique pourquoi plus rien n'est modifiable en dessous. */}
        <ClotureOdjBloc
          id={id}
          {...(odj.cloture ? { cloture: odj.cloture } : {})}
          {...(supervisionId ? { supervisionId } : {})}
          onCloturer={onCloturer}
        />

        {odj.cloture ? (
          // Clos = document fige, sans aucune affordance d'edition.
          <div className="rounded-lg border border-line bg-white shadow-sm px-8 py-8 sm:px-10 sm:py-9">
            <DocumentOdj odj={odj} />
          </div>
        ) : (
          <DocumentOdjEditable odj={odj} onSaisir={onSaisir} onTogglePoint={onToggle} />
        )}
      </div>
    </AppShell>
  );
}
