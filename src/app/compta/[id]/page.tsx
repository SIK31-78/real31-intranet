import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCoproCompta, getEtatCompta } from "@/lib/services/compta/get-compta";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutVoirComptabilite } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { ComptaChecklist } from "@/components/compta/compta-checklist";
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

  // Le pole compta (COMPTABLES) / super-admin resout N'IMPORTE quelle copro (transverse,
  // il n'a pas de portefeuille) ; un gestionnaire reste cloisonne a ses copros -> notFound
  // hors scope. Ce role decide aussi du role du dialogue (comptable vs gestionnaire).
  const transverse = peutVoirComptabilite(g.email, g.role);
  const copro = await getCoproCompta(code, g.id, { transverse });
  if (!copro) notFound();
  const etat = await getEtatCompta(code, agDate);

  return (
    <AppShell user={g} active="compta" breadcrumb={`Pôle compta · ${code}`}>
      <div className="mx-auto max-w-[820px] px-8 py-8 flex flex-col gap-5">
        <div>
          <Link href="/comptabilite" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-green-700">
            <ArrowLeft strokeWidth={1.5} className="w-3.5 h-3.5" /> Comptabilité
          </Link>
          <h1 className="mt-1 text-[20px] font-semibold text-ink">
            {copro.nom} <span className="text-[14px] font-normal text-ink-3">({code})</span>
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-2">Préparation des comptes · AG du {formatDateLongue(agDate)}</p>
        </div>

        {/* Checklist des postes : le coeur de la verification. Le feu vert final (flag
            "comptes verifies") et le fil de notes restent dans le panneau ci-dessous. */}
        <ComptaChecklist coproCode={code} agDateISO={agDate} checks={etat.checks} />

        <ComptaPanel coproCode={code} agDateISO={agDate} etat={etat} role={transverse ? "comptable" : "gestionnaire"} />
      </div>
    </AppShell>
  );
}
