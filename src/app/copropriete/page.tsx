import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getCoproprietes } from "@/lib/services/coproprietes/get-coproprietes";
import { libelleSource } from "@/lib/domain/copropriete";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Toutes les copropriétés — REAL31 Intranet" };

// Mock session : meme ancre que les autres ecrans.
const GESTIONNAIRE = { id: "el", nomComplet: "Élise Lambert", initiales: "EL" };

export default async function CoproprietesPage() {
  const copros = await getCoproprietes();

  return (
    <AppShell user={GESTIONNAIRE} active="copros" breadcrumb="Copropriétés">
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <div className="mb-5">
          <h1 className="text-[20px] font-medium tracking-tight text-ink">Toutes les copropriétés</h1>
          <p className="text-[13px] text-ink-3 mt-0.5">
            {copros.length} copropriété{copros.length > 1 ? "s" : ""} · cloisonnement par gestionnaire à venir (authentification).
          </p>
        </div>

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
      </div>
    </AppShell>
  );
}
