import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutCompleterProposition, profilDe } from "@/lib/auth/roles";
import { propositionsARapprocher } from "@/lib/services/proposition/propositions";
import { LIBELLE_STATUT } from "@/lib/domain/proposition/proposition";
import { formatJour } from "@/lib/services/facturation/format";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RattacherRegistre } from "@/components/proposition/rattacher-registre";
import Link from "next/link";

export const metadata: Metadata = { title: "Propositions à rapprocher - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Les propositions ouvertes que le registre n'a pas pu rattacher seul (commune absente de
// l'adresse, deux immeubles possibles, « 52 ter » contre « 52 ») : un humain choisit.
// L'immatriculation est la seule cle stable d'un immeuble - c'est elle qui donne
// l'historique (« ils nous ont deja consultes en 2019 ») et le lien avec la copro App A.

export default async function ARapprocherPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!peutCompleterProposition(profilDe(g))) redirect("/propositions");
  const lignes = await propositionsARapprocher();
  const avec = lignes.filter((l) => l.suggestion.candidats.length > 0);
  const sans = lignes.filter((l) => l.suggestion.candidats.length === 0);

  return (
    <AppShell user={g} active="propositions" breadcrumb="Propositions · À rapprocher">
      <Page largeur="travail">
        <PageHeader
          titre="À rapprocher du registre"
          eyebrow={`${lignes.length} proposition${lignes.length > 1 ? "s" : ""} ouverte${lignes.length > 1 ? "s" : ""} sans immatriculation`}
          actions={<ButtonLink href="/propositions" variant="secondary" size="sm"><ArrowLeft strokeWidth={1.5} /> Pipeline</ButtonLink>}
          aide={
            <p>
              Le registre national identifie chaque copropriété par son immatriculation — la seule chose qui ne change
              pas quand l&apos;adresse est écrite différemment. Rattacher une proposition, c&apos;est retrouver son historique
              (les fois où l&apos;immeuble nous a déjà consultés) et savoir si c&apos;est une copropriété que nous gérons ou
              avons gérée. Les cas nets ont été rattachés automatiquement ; ici, il reste un doute, à vous de trancher.
            </p>
          }
        />

        {avec.length === 0 ? (
          <EmptyState>Rien à rapprocher : toutes les propositions ouvertes avec une adresse lisible sont rattachées</EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {avec.map(({ proposition: p, suggestion }) => (
              <Card key={p.id}>
                <CardBody className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex items-baseline gap-2 min-w-0">
                      <Link href={`/propositions/${p.id}`} className="text-body font-medium text-ink hover:underline truncate">{p.immeuble.adresse}</Link>
                      <span className="text-meta text-ink-3">
                        {[p.immeuble.commune, p.immeuble.lotsPrincipaux !== undefined ? `${p.immeuble.lotsPrincipaux} lots` : null, p.contact.nom, p.agence].filter(Boolean).join(" · ")}
                        {p.premierContactISO && ` · ${formatJour(p.premierContactISO)}`}
                      </span>
                    </span>
                    <Badge ton={p.statut === "accepte_cs" ? "warn" : p.statut === "reporte" ? "neutral" : "info"}>{LIBELLE_STATUT[p.statut]}</Badge>
                  </div>
                  <RattacherRegistre propositionId={p.id} sur={suggestion.sur} candidats={suggestion.candidats} />
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {sans.length > 0 && (
          <Card>
            <CardBody className="flex flex-col gap-2">
              <p className="text-body text-ink-2">
                {sans.length} proposition{sans.length > 1 ? "s" : ""} sans candidat au registre (adresse incomplète, faute de frappe, ou immeuble
                hors 75/78/92/95) : à rattacher depuis leur fiche si besoin.
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-meta">
                {sans.map(({ proposition: p }) => (
                  <li key={p.id}><Link href={`/propositions/${p.id}`} className="text-ink-2 hover:text-ink hover:underline">{p.immeuble.adresse}</Link></li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </Page>
    </AppShell>
  );
}
