import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { getCoproprietes } from "@/lib/services/coproprietes/get-coproprietes";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { libelleSource } from "@/lib/domain/copropriete";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkeletonListe } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Toutes les copropriétés - REAL31 Intranet" };

// Lit la vraie data : rendu a la demande, jamais prerendu statique.
export const dynamic = "force-dynamic";

export default async function CoproprietesPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  return (
    <AppShell user={g} active="copros" breadcrumb="Copropriétés">
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <h1 className="text-[20px] font-medium tracking-tight text-ink mb-1">Toutes les copropriétés</h1>
        <Suspense fallback={<SkeletonListe lignes={8} />}>
          <ListeCopros gestionnaireId={g.id} />
        </Suspense>
      </div>
    </AppShell>
  );
}

async function ListeCopros({ gestionnaireId }: { gestionnaireId: string }) {
  const copros = await getCoproprietes(gestionnaireId);
  return (
    <>
      <p className="text-[13px] text-ink-3 mb-4">
        {copros.length} copropriété{copros.length > 1 ? "s" : ""} dans votre périmètre.
      </p>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {copros.map((c) => (
            <li key={c.code}>
              <Link
                href={`/copropriete/${c.code}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"
              >
                <Badge ton="outline" className="font-mono shrink-0">{c.code}</Badge>
                <span className="text-[13px] font-medium text-ink flex-1 truncate">{c.nom}</span>
                <span className="text-[12px] text-ink-3 hidden sm:block">{c.adresse.ville}</span>
                <Badge ton={c.source === "estale" ? "info" : "neutral"} className="shrink-0">
                  {libelleSource(c.source)}
                </Badge>
                <ChevronRight strokeWidth={1.5} className="w-4 h-4 text-ink-3 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
