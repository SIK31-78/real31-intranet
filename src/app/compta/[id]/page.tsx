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
import { Page, PageHeader } from "@/components/ui/page";

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
      <Page largeur="lecture">
        <PageHeader
          eyebrow={
            <Link href="/comptabilite" className="inline-flex items-center gap-1 hover:text-ink">
              <ArrowLeft strokeWidth={1.5} className="w-3 h-3" /> Comptabilité
            </Link>
          }
          titre={copro.nom}
          code={code}
          meta={`Préparation des comptes · AG du ${formatDateLongue(agDate)}`}
        />

        {/* Checklist des postes : le coeur de la verification. Le feu vert final (flag
            "comptes verifies") et le fil de notes restent dans le panneau ci-dessous. */}
        <ComptaChecklist coproCode={code} agDateISO={agDate} checks={etat.checks} />

        <ComptaPanel coproCode={code} agDateISO={agDate} etat={etat} role={transverse ? "comptable" : "gestionnaire"} />
      </Page>
    </AppShell>
  );
}
