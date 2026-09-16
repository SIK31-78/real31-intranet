import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estDirection, profilDe } from "@/lib/auth/roles";
import { getFicheCollaborateur } from "@/lib/services/collaborateurs/collaborateurs";
import { libelleFonction, taillePortefeuille } from "@/lib/domain/collaborateur";
import { formatJour } from "@/lib/services/facturation/format";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FicheCollaborateur } from "./fiche-collaborateur";

export const metadata: Metadata = { title: "Collaborateur - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function CollaborateurPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!estDirection(profilDe(g))) redirect("/accueil");
  const fiche = await getFicheCollaborateur(id);
  if (!fiche) notFound();
  const c = fiche.collaborateur;
  const nb = taillePortefeuille(fiche.portefeuille);

  return (
    <AppShell user={g} active="collaborateurs" breadcrumb={`Collaborateurs · ${c.nomComplet}`}>
      <Page largeur="travail">
        <PageHeader
          titre={c.nomComplet}
          eyebrow={[libelleFonction(c), c.agenceCode ? `agence ${c.agenceCode}` : null, c.email].filter(Boolean).join(" · ")}
          badge={fiche.enPoste ? <Badge ton="ok" size="md">En poste</Badge> : <Badge ton="err" size="md">{c.departISO ? `Parti le ${formatJour(c.departISO)}` : "Inactif"}</Badge>}
          meta={`${nb} copropriété${nb > 1 ? "s" : ""} au portefeuille${c.arriveeISO ? ` · arrivé le ${formatJour(c.arriveeISO)}` : ""}${c.note ? ` · ${c.note}` : ""}`}
          actions={<ButtonLink href="/collaborateurs" variant="secondary" size="sm"><ArrowLeft strokeWidth={1.5} /> Annuaire</ButtonLink>}
        />
        <FicheCollaborateur fiche={fiche} />
      </Page>
    </AppShell>
  );
}
