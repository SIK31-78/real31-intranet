import type { Metadata } from "next";
import Link from "next/link";
import { Printer, ListChecks, AlertTriangle } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getOdj } from "@/lib/services/odj/get-odj";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { LigneChamp } from "@/components/odj/ligne-champ";
import { PointLegalRow } from "@/components/odj/point-legal-row";
import { PanneauApercu } from "@/components/odj/panneau-apercu";
import { DocumentOdj } from "@/components/odj/document-odj";
import { saisirChampAction, togglePointAction } from "./actions";

export const metadata: Metadata = { title: "ODJ - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function OdjPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const odj = await getOdj(id, g.id);
  if (!odj) notFound();

  const onSaisir = saisirChampAction.bind(null, id);
  const onToggle = togglePointAction.bind(null, id);

  return (
    <AppShell user={g} active="aucun" breadcrumb={`ODJ - ${odj.copro.nom}`}>
      <div className="mx-auto max-w-[1380px] px-8 py-8 flex items-start gap-6">
        <div className="flex-1 min-w-0 max-w-[900px] flex flex-col gap-5">
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
            En-tete et echeances pre-remplis, points legaux pre-ecrits. Cliquez le crayon pour saisir ou
            corriger un champ (le vider retablit la valeur automatique).
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

        <Card>
          <CardHeader>
            <CardTitle>En-tete</CardTitle>
          </CardHeader>
          <div>
            {odj.enTete.map((c) => (
              <LigneChamp key={c.id} champ={c} onSaisir={onSaisir} />
            ))}
          </div>
        </Card>

        {odj.sections.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>{s.titre}</CardTitle>
            </CardHeader>
            <div>
              {s.champs.map((c) => (
                <LigneChamp key={c.id} champ={c} onSaisir={onSaisir} />
              ))}
            </div>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle>Points reglementaires / recurrents (textes pre-ecrits)</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-line">
            {odj.pointsLegaux.map((p) => (
              <PointLegalRow key={p.id} point={p} onToggle={onToggle} />
            ))}
          </ul>
        </Card>
        </div>

        {/* Apercu live du document (repliable), rafraichi a chaque saisie */}
        <div className="hidden xl:block">
          <PanneauApercu>
            <DocumentOdj odj={odj} />
          </PanneauApercu>
        </div>
      </div>
    </AppShell>
  );
}
