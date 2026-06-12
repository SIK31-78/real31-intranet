import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOdj } from "@/lib/services/odj/get-odj";
import { getGestionnaireCourant } from "@/lib/auth/session";
import type { ChampOdj, SourceDonnee } from "@/lib/domain/odj";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "ODJ - REAL31 Intranet" };
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<SourceDonnee, { texte: string; cls: string }> = {
  supabase: { texte: "auto", cls: "bg-ok-50 text-ok-700" },
  jalon: { texte: "auto (jalon)", cls: "bg-ok-50 text-ok-700" },
  estale: { texte: "a venir (eStale)", cls: "bg-info-50 text-info-700" },
  manuel: { texte: "a saisir", cls: "bg-surface-2 text-ink-3" },
};

function Ligne({ champ }: { champ: ChampOdj }) {
  const src = SOURCE_LABEL[champ.source];
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2 border-b border-line last:border-b-0">
      <span className="text-[13px] text-ink-2 flex-1 min-w-0">{champ.libelle}</span>
      <span className="text-[13px] text-ink shrink-0 max-w-[45%] text-right">
        {champ.valeur ?? <span className="text-ink-4 italic">-</span>}
      </span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm shrink-0 ${src.cls}`}>{src.texte}</span>
    </div>
  );
}

export default async function OdjPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const odj = await getOdj(id, g.id);
  if (!odj) notFound();

  return (
    <AppShell user={g} active="calendrier" breadcrumb={`ODJ - ${odj.copro.nom}`}>
      <div className="mx-auto max-w-[900px] px-8 py-8 flex flex-col gap-5">
        <div>
          <h1 className="text-[22px] font-medium tracking-tight">Ordre du jour - preparation AG</h1>
          <p className="text-[13px] text-ink-3 mt-1">
            {odj.copro.nom} ({odj.copro.code}){odj.dateAg ? ` - AG du ${odj.dateAg}` : " - date d'AG non definie"}
          </p>
          <p className="text-[12px] text-ink-4 mt-2">
            Squelette auto-genere : en-tete et echeances pre-remplis, points legaux pre-ecrits. Les chiffres
            (comptes, eau, fonds travaux...) viendront depuis eStale ; le reste se saisit.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>En-tete</CardTitle>
          </CardHeader>
          <div>{odj.enTete.map((c) => <Ligne key={c.libelle} champ={c} />)}</div>
        </Card>

        {odj.sections.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>{s.titre}</CardTitle>
            </CardHeader>
            <div>{s.champs.map((c) => <Ligne key={c.libelle} champ={c} />)}</div>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle>Points reglementaires / recurrents (textes pre-ecrits)</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-line">
            {odj.pointsLegaux.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-ink">{p.titre}</span>
                  {p.condition && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-warn-50 text-warn-700">
                      conditionnel
                    </span>
                  )}
                </div>
                {p.condition && <p className="text-[11.5px] text-warn-700 mt-1">{p.condition}</p>}
                <p className="text-[12.5px] text-ink-2 mt-1 leading-snug">{p.texte}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}
