import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getEtatCompta } from "@/lib/services/compta/get-compta";
import { getCoproRepository } from "@/lib/adapters/router";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { ComptaPanel } from "@/components/compta/compta-panel";
import { formatDateLongue } from "@/lib/format-date";

export const metadata: Metadata = { title: "Compta AG - REAL31 Intranet" };
export const dynamic = "force-dynamic";

function parse(id: string): { code: string; agDate?: string } {
  const i = id.indexOf("__");
  return i < 0 ? { code: id } : { code: id.slice(0, i), agDate: id.slice(i + 2) };
}

export default async function ComptaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const { code, agDate } = parse(id);
  if (!agDate) notFound();

  const copro = await getCoproRepository().findByCode(code);
  const etat = await getEtatCompta(code, agDate);

  return (
    <AppShell user={g} active="compta" breadcrumb={`Pôle compta · ${code}`}>
      <div className="mx-auto max-w-[820px] px-8 py-8 flex flex-col gap-4">
        <div>
          <Link href="/compta" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-green-700">
            <ArrowLeft strokeWidth={1.5} className="w-3.5 h-3.5" /> Pôle compta
          </Link>
          <h1 className="mt-1 text-[20px] font-semibold text-ink">
            {copro?.nom ?? code} <span className="text-[14px] font-normal text-ink-3">({code})</span>
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-2">AG du {formatDateLongue(agDate)}</p>
        </div>

        <ComptaPanel coproCode={code} agDateISO={agDate} etat={etat} role="comptable" />
      </div>
    </AppShell>
  );
}
