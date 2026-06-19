import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Calculator, AlertTriangle, MessageSquare, ChevronRight } from "lucide-react";
import { listerAgAPreparer } from "@/lib/services/compta/get-compta";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateLongue } from "@/lib/format-date";

export const metadata: Metadata = { title: "Pôle compta - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function ComptaPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const file = await listerAgAPreparer(g.id);

  return (
    <AppShell user={g} active="compta" breadcrumb="Pôle compta">
      <div className="mx-auto max-w-[1000px] px-8 py-8 flex flex-col gap-5">
        <div>
          <h1 className="text-[20px] font-semibold text-ink flex items-center gap-2">
            <Calculator strokeWidth={1.5} className="w-5 h-5 text-green-700" />
            Pôle compta - AG à préparer
          </h1>
          <p className="mt-1 text-[13px] text-ink-3">
            Les AG dont la date est posée. Vérifie les comptes, échange tes notes avec le
            gestionnaire, et marque « comptes vérifiés » quand c&apos;est prêt.
          </p>
        </div>

        {file.length === 0 ? (
          <Card>
            <p className="px-4 py-8 text-[13px] text-ink-3 text-center">
              Aucune AG à préparer (aucune date d&apos;AG posée), ou la table compta n&apos;est pas
              encore créée.
            </p>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {file.map((a) => (
                <li key={`${a.coproCode}-${a.agDate}`}>
                  <Link
                    href={`/compta/${a.coproCode}__${a.agDate}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"
                  >
                    <span className="font-mono text-[12px] text-ink-2 w-[44px] shrink-0">{a.coproCode}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink truncate">{a.coproNom}</p>
                      <p className="text-[12px] text-ink-3">AG du {formatDateLongue(a.agDate)}</p>
                    </div>
                    {a.envoyerAvant && (
                      <Badge ton="warn" dot>
                        <AlertTriangle strokeWidth={1.5} className="w-3 h-3" /> avant réunion
                      </Badge>
                    )}
                    {a.notesOuvertes > 0 && (
                      <Badge ton="neutral">
                        <MessageSquare strokeWidth={1.5} className="w-3 h-3" /> {a.notesOuvertes}
                      </Badge>
                    )}
                    {a.comptesVerifies ? (
                      <Badge ton="ok" dot>
                        vérifiés
                      </Badge>
                    ) : (
                      <Badge ton="outline">à vérifier</Badge>
                    )}
                    <ChevronRight strokeWidth={1.5} className="w-4 h-4 text-ink-4 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
