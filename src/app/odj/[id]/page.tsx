import type { Metadata } from "next";
import Link from "next/link";
import { Printer } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getOdj } from "@/lib/services/odj/get-odj";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { LigneChamp } from "@/components/odj/ligne-champ";
import { PointLegalRow } from "@/components/odj/point-legal-row";
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
    <AppShell user={g} active="calendrier" breadcrumb={`ODJ - ${odj.copro.nom}`}>
      <div className="mx-auto max-w-[900px] px-8 py-8 flex flex-col gap-5">
        <div>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-[22px] font-medium tracking-tight">Ordre du jour - preparation AG</h1>
            <Link
              href={`/odj/${id}/imprimer`}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line bg-surface text-[13px] font-medium text-ink-2 hover:border-line-2 hover:text-ink transition-colors shrink-0"
            >
              <Printer strokeWidth={1.5} className="w-3.5 h-3.5" />
              Version imprimable
            </Link>
          </div>
          <p className="text-[13px] text-ink-3 mt-1">
            {odj.copro.nom} ({odj.copro.code}){odj.dateAg ? ` - AG du ${odj.dateAg}` : " - date d'AG non definie"}
          </p>
          <p className="text-[12px] text-ink-4 mt-2">
            En-tete et echeances pre-remplis, points legaux pre-ecrits. Le crayon saisit ou corrige un champ
            (vider = retour a la valeur auto) ; les chiffres viendront depuis eStale.
          </p>
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
    </AppShell>
  );
}
