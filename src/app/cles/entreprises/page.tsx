import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { jourParis } from "@/lib/services/date-du-jour";
import { listerEntreprises } from "@/lib/services/cles/lecture";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { FormulaireEntreprise } from "@/components/cles/formulaire-entreprise";
import { ListeEntreprises } from "@/components/cles/liste-entreprises";
import { METIERS_PRESTATAIRE, type MetierPrestataire } from "@/lib/domain/contrats-copro/types";

// Le métier d'un `?metier=` d'URL, ou rien s'il est inconnu. Ici (serveur) et pas dans le
// composant client : une fonction d'un module « use client » ne s'appelle pas depuis le serveur.
function metierDepuisParam(valeur: string | string[] | undefined): MetierPrestataire | undefined {
  const v = Array.isArray(valeur) ? valeur[0] : valeur;
  return v && (METIERS_PRESTATAIRE as readonly string[]).includes(v) ? (v as MetierPrestataire) : undefined;
}

export const metadata: Metadata = { title: "Entreprises - Gestion des clés - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function EntreprisesPage({ searchParams }: { searchParams: Promise<{ metier?: string | string[] }> }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const metierInitial = metierDepuisParam((await searchParams).metier);
  const entreprises = await listerEntreprises(jourParis());
  const detentrices = entreprises.filter((e) => e.detenus > 0).length;
  return (
    <AppShell user={g} active="cles" breadcrumb="Gestion des clés · Entreprises">
      <Page largeur="travail">
        <PageHeader
          titre="Entreprises"
          eyebrow={`${entreprises.length} entreprise${entreprises.length > 1 ? "s" : ""} · ${detentrices} détiennent des trousseaux`}
          actions={<ButtonLink href="/cles" variant="ghost" size="sm"><ArrowLeft strokeWidth={1.5} /> Comptoir</ButtonLink>}
          aide={<p>Le référentiel est commun à tout le cabinet et sert aussi aux contrats des copropriétés : ascensoristes, courtiers, fournisseurs de gaz s’y retrouvent avec leurs métiers. Une entreprise se crée aussi à la volée depuis « Sortir » ou « Réserver ». Bloquer une entreprise (direction) empêche de lui confier un trousseau.</p>}
        />
        <Section id="ent-liste" titre="Toutes les entreprises" compte={entreprises.length}>
          <ListeEntreprises metierInitial={metierInitial} entreprises={entreprises.map((e) => ({ id: e.id, nom: e.nom, telephone: e.telephone, email: e.email, detenus: e.detenus, enRetard: e.enRetard, bloquee: e.statut === "bloquee", metiers: e.metiers ?? [], courtierPartenaire: Boolean(e.courtierPartenaire) }))} />
        </Section>
        <Section id="ent-nouvelle" titre="Nouvelle entreprise">
          <Card><CardBody><FormulaireEntreprise /></CardBody></Card>
        </Section>
      </Page>
    </AppShell>
  );
}
